import express from "express";
import cookieParser from "cookie-parser";
import userRouter from "./routes/userRoute.js";
import connectDB from "./db/connectdb.js";
import cors from "cors";
import http from 'http';
import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import dotenv from "dotenv";
import userModel from "./models/userModel.js"; // Ensure you have the correct import for your user model
dotenv.config();

const app = express();
const port = process.env.PORT || "3000";
const DATABASE_URL = process.env.DATABASE_URL;

// CORS configuration to allow requests from your frontend origin
app.use(cors({
  origin: process.env.ORIGIN_URL || 'http://localhost:3002', // Update this to match your frontend URL
  credentials: true
}));

app.use(express.json());
app.use(cookieParser());

// Connect to the database
connectDB(DATABASE_URL);

// Create HTTP server and set up Socket.IO with CORS and token-based authentication
const server = http.createServer(app);
const io = new Server(server, {
  cors: { 
    origin: process.env.ORIGIN_URL || 'http://localhost:3002', // Update this to match your frontend URL 
    methods: ["GET", "POST"],
    credentials: true,
  },
});

// Middleware to authenticate Socket.IO connections using JWT
io.use((socket, next) => {
  const token = socket.handshake.query.token;
  if (token) {
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
      if (err) {
        console.error("Socket authentication failed:", err.message);
        return next(new Error('Authentication error'));
      }
      socket.user = decoded;
      next();
    });
  } else {
    next(new Error('Authentication error'));
  }
});

// Online users set
const onlineUsers = new Set();

// Socket.IO connection handling
io.on("connection", (socket) => {
  console.log("A user connected:", socket.user);

  // Add user to online users list
  onlineUsers.add(socket.user.id);

  // Broadcast the updated online users list
  const broadcastLoggedUsers = async () => {
    const loggedUsers = await userModel.find({ _id: { $in: Array.from(onlineUsers) } });
    io.emit("loggedUsersUpdate", loggedUsers);
  };
  broadcastLoggedUsers();

  // Handle user disconnection
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.user);

    // Remove user from online users
    onlineUsers.delete(socket.user.id);

    // Broadcast the updated online users list
    broadcastLoggedUsers();
  });
});

// User routes with io instance
app.use("/api/user", (req, res, next) => {
  req.io = io;  // Attach io instance to request
  next();
}, userRouter);

// Start the server
server.listen(port, () => {
  console.log(`Server running on port ${port}`);
});




 // Real-time updates for logged users
 useEffect(() => {
  if (socket) {
    // Listen for updates to logged users
    socket.on("loggedUsersUpdate", (updatedUsers) => {
      setAllUsers(updatedUsers);
      localStorage.setItem("loggedusers", JSON.stringify(updatedUsers));
    });

    // Clean up the event listener
    return () => {
      socket.off("loggedUsersUpdate");
    };
  }
}, [socket]);

// Fetch logged users (fallback)
const getLoggedUser = useCallback(async () => {
  try {
    const response = await axios.get(`${baseUrl}loggedusers/`, {
      withCredentials: true, // Ensure cookies are sent with the request
    });
    setAllUsers(response.data);
    localStorage.setItem("loggedusers", JSON.stringify(response.data));
    return response.data;
  } catch (error) {
    console.error("Error fetching logged user:", error);
    logoutUser(); // Log out if the backend is not reachable or token is expired
  }
}, [baseUrl, logoutUser]);

// Initialize authentication on app start
useEffect(() => {
  const initializeAuth = async () => {
    try {
      await getLoggedUser(); // Fetch initial user data on page load
    } catch (error) {
      console.error("Error initializing auth:", error);
    }
  };

  initializeAuth();
}, [getLoggedUser]);