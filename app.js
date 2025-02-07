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

// Online users set
const onlineUsers = new Set();
const userSocketMap = new Map();

// Handle Socket.IO connections
io.on("connection", (socket) => {
  // Handle initial connection
  if (socket.user?.id) {
    onlineUsers.add(socket.user.id);
    userSocketMap.set(socket.user.id, socket.id);
  }

  // Handle custom userOnline event
  socket.on("userOnline", (userId) => {
    onlineUsers.add(userId);
    userSocketMap.set(userId, socket.id);
    sendActiveUsersExceptCurrent(userId); // Emit active users excluding the current user
  });

  // Handle disconnection
  socket.on("disconnect", () => {
    onlineUsers.delete(socket.user?.id);
    userSocketMap.delete(socket.user?.id);
  });
});


// Function to emit online users excluding the specified user ID
const sendActiveUsersExceptCurrent = async (excludedUserId) => {
  try {
    // Fetch full user objects, excluding passwords
    const loggedUsers = await userModel.find(
      { _id: { $in: Array.from(onlineUsers) } },
      "-password"
    );

    // Filter users by excluding the current user
    const filteredUsers = loggedUsers.filter(user => user._id.toString() !== excludedUserId);

    // Find socket ID of the excluded user
    const excludedSocketId = userSocketMap.get(excludedUserId);

    if (excludedSocketId) {
      io.to(excludedSocketId).emit("loggedUsersUpdate", filteredUsers); // Emit full objects
    }
  } catch (error) {
    console.error("Error fetching filtered online users:", error);
  }
};


// Attach io instance to req for routes
app.use("/api/user", (req, res, next) => {
  req.io = io;
  req.onlineUsers = onlineUsers;
  next();
}, userRouter);

// Connect to DB and start server
connectDB(DATABASE_URL);
server.listen(port, () => console.log(`Server running on port ${port}`));
