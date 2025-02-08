import express from "express";
import cookieParser from "cookie-parser";
import userRouter from "./routes/userRoute.js";
import connectDB from "./db/connectdb.js";
import cookie from "cookie";
import cors from "cors";
import http from 'http';
import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import dotenv from "dotenv";
import userModel from "./models/userModel.js";
dotenv.config();

// Initialize app
const app = express();
const port = process.env.PORT || "3000";
const DATABASE_URL = process.env.DATABASE_URL;
const originUrl = process.env.ORIGIN_URL || 'http://localhost:3002'; 

// Middleware configurations
app.use(cors({
  origin: originUrl, 
  credentials: true
}));
app.use(express.json());
app.use(cookieParser());

// Create HTTP server and set up Socket.IO with CORS and token-based authentication
const server = http.createServer(app);
const io = new Server(server, {
  cors: { 
    origin: originUrl,  
    methods: ["GET", "POST"],
    credentials: true,
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

// Online users tracking
const onlineUsers = new Set();
const userSocketMap = new Map(); // Stores userId -> socketId mapping
const userDataCache = new Map(); // Store user details in memory

io.on("connection", async (socket) => {
  if (socket.user?.id) {
    userSocketMap.set(socket.user.id, socket.id);
    onlineUsers.add(socket.user.id);

    // Store user details in cache if not already stored
    if (!userDataCache.has(socket.user.id)) {
      const user = await userModel.findById(socket.user.id, "-password");
      if (user) {
        userDataCache.set(socket.user.id, user);
        // console.log(userDataCache.set(socket.user.id, user))
      }
    }

    await sendOnlineUsersList(); // Ensure it's awaited
  }

  // Handle userOnline event (optional)
  socket.on("userOnline", async (userId) => {
    if (userId && !onlineUsers.has(userId)) {
      onlineUsers.add(userId);
      userSocketMap.set(userId, socket.id);
      await sendOnlineUsersList();
    }
  });

  socket.on("disconnect", async () => {
    userSocketMap.delete(socket.user?.id);
    onlineUsers.delete(socket.user?.id);
    await sendOnlineUsersList();
  });
});

// Function to send updated online users list to each user individually
const sendOnlineUsersList = async () => {
  const loggedUsers = Array.from(onlineUsers)
    .map((userId) => userDataCache.get(userId))
    .filter((user) => user); // Remove undefined users

  onlineUsers.forEach((userId) => {
    const socketId = userSocketMap.get(userId);
    if (socketId) {
      io.to(socketId).emit(
        "loggedUsersUpdate",
        loggedUsers.filter((user) => user && user._id.toString() !== userId) // Exclude self
      );
    }
  });
};


// Attach io instance to req for routes
app.use(
  "/api/user",
  (req, res, next) => {
    req.io = io;
    req.onlineUsers = onlineUsers;
    next();
  },
  userRouter
);

// Connect to DB and start server
connectDB(DATABASE_URL);
server.listen(port, () => console.log(`Server running on port ${port}`));
