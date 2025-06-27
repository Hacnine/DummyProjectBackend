import express from "express";
import cookieParser from "cookie-parser";
import userRouter from "./routes/userRoute.js";
import conversationRouter from './routes/conversationRoute.js';
import messageRouter from './routes/messageRoute.js';
import quickMessageRouter from './routes/quickMessageRoute.js';
import quickLessonRouter from './routes/quickLessonRoute.js';
import adminRouter from './routes/adminRoutes.js';
import adminUserRouter from './routes/adminUserRoutes.js';
import connectDB from "./db/connectdb.js";
import cookie from "cookie";
import cors from "cors";
import http from 'http';
import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import dotenv from "dotenv";
import userModel from "./models/userModel.js";
import session from 'express-session';
import { RedisStore } from "connect-redis";
import { createClient } from "redis";

dotenv.config();

// Initialize Redis client.
const redisClient = createClient({
  url: process.env.REDIS_URL || "redis://localhost:6379",
});
redisClient.on('error', (err) => console.error('Redis Client Error', err));

redisClient.connect().catch(console.error);

// Initialize Redis store for sessions.
const redisStore = new RedisStore({
  client: redisClient,
  prefix: "alfajr:", // Customize prefix for your application
});

// Initialize app
const app = express();
const port = process.env.PORT || "3001";
const DATABASE_URL = process.env.DATABASE_URL;
const originUrl = process.env.ORIGIN_URL || 'http://localhost:3002'; 

// Middleware configurations
app.use(cors({
  origin: originUrl, 
  credentials: true
}));
app.use('/images', express.static('public/images'));
app.use(express.json());
app.use(cookieParser());
app.use(express.urlencoded({ extended: true })); 

// Configure express-session AFTER cookieParser
app.use(
  session({
    store: redisStore, // Use custom Redis session store
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      sameSite: 'None',
      maxAge: 24 * 60 * 60 * 1000, // 1 day
    },
  })
);

// Create HTTP server and set up Socket.IO with CORS and token-based authentication
const server = http.createServer(app);
const io = new Server(server, {
  cors: { 
    origin: originUrl, 
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH" ],
    allowedHeaders: ["Content-Type", "Authorization"],
  },
});

// Middleware to authenticate Socket.IO connections using JWT
io.use((socket, next) => {
  const cookies = socket.handshake.headers.cookie;
  
  if (!cookies) {
    return next(new Error("Authentication error: No cookies found"));
  }

  const parsedCookies = cookie.parse(cookies);
  const token = parsedCookies.access_token; // Ensure this matches your cookie name

  if (!token) {
    return next(new Error("Authentication error: No token found"));
  }

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      console.error("Socket authentication failed:", err.message);
      return next(new Error("Authentication error"));
    }
    socket.user = decoded;
    next();
  });
});

// Set Redis keys
const ONLINE_USERS_KEY = 'onlineUsers';
const USER_SOCKET_MAP_KEY = 'userSocketMap';
const USER_DATA_CACHE_KEY = 'userDataCache';

// Online users tracking
io.on("connection", async (socket) => {
  if (socket.user?.id) {
    const userId = socket.user.id;
    const socketId = socket.id;

    // Add user to online users set
    await redisClient.sAdd(ONLINE_USERS_KEY, userId);

    // Add user socket mapping
    await redisClient.hSet(USER_SOCKET_MAP_KEY, userId, socketId);

    // Store user details in cache if not already stored
    if (!(await redisClient.hExists(USER_DATA_CACHE_KEY, userId))) {
      const user = await userModel.findById(userId, "-password");
      if (user) {
        await redisClient.hSet(USER_DATA_CACHE_KEY, userId, JSON.stringify(user));
      }
    }

    await sendOnlineUsersList(); // Ensure it's awaited
  }

  // Handle user-online event (optional)
  socket.on("userOnline", async (userId) => {
    if (userId && !(await redisClient.sIsMember(ONLINE_USERS_KEY, userId))) {
      await redisClient.sAdd(ONLINE_USERS_KEY, userId);
      await redisClient.hSet(USER_SOCKET_MAP_KEY, userId, socket.id);
      await sendOnlineUsersList();
    }
  });

  // Handle typing event
  socket.on('joinRoom', (conversationId) => {
    socket.join(conversationId);
  });

  socket.on('typing', async ({ conversationId, userId, isTyping }) => {
    io.to(conversationId).emit('typing', { userId, isTyping });
  });

  // Handle sendMessage event
  socket.on("sendMessage", async (message) => {
    const receiverSocketId = await redisClient.hGet(USER_SOCKET_MAP_KEY, message.receiver);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit('receiveMessage', message);
    }
  });

  socket.on("disconnect", async () => {
    const userId = socket.user?.id;
    if (userId) {
      await redisClient.sRem(ONLINE_USERS_KEY, userId);
      await redisClient.hDel(USER_SOCKET_MAP_KEY, userId);
      await sendOnlineUsersList();
    }
  });
});

// Function to send updated online users list to each user individually
const sendOnlineUsersList = async () => {
  const onlineUserIds = await redisClient.sMembers(ONLINE_USERS_KEY);
  const loggedUsers = [];

  for (const userId of onlineUserIds) {
    const userData = await redisClient.hGet(USER_DATA_CACHE_KEY, userId);
    if (userData) {
      loggedUsers.push(JSON.parse(userData));
    }
  }

  for (const userId of onlineUserIds) {
    const socketId = await redisClient.hGet(USER_SOCKET_MAP_KEY, userId);
    if (socketId) {
      io.to(socketId).emit(
        "loggedUsersUpdate",
        loggedUsers.filter((user) => user && user._id.toString() !== userId) // Exclude self
      );
    }
  }
};

// Attach io instance to req for routes
const attachIo = (req, res, next) => {
  req.io = io;
  req.onlineUsers = redisClient.sMembers(ONLINE_USERS_KEY);
  next();
};

app.use("/user", attachIo, userRouter);
app.use("/conversations", attachIo, conversationRouter);
app.use("/messages", attachIo, messageRouter);
app.use("/quick-messages", attachIo, quickMessageRouter);
app.use("/quick-lessons",attachIo, quickLessonRouter);
app.use("/admin", attachIo, adminRouter);
app.use("/admin/user-management", attachIo, adminUserRouter);

// Connect to DB and start server
connectDB(DATABASE_URL)
  .then(() => {
    server.listen(port, () => console.log(`Server running on port ${port}`));
  })
  .catch((err) => {
    console.error("Failed to connect to the database:", err);
    process.exit(1); // Exit the process with a failure code
  });