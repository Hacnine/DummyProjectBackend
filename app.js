import express from "express";
import cookieParser from "cookie-parser";
import userRouter from "./routes/userRoute.js";
import conversationRouter from "./routes/conversationRoute.js";
import messageRouter from "./routes/messageRoute.js";
import quickMessageRouter from "./routes/quickMessageRoute.js";
import quickLessonRouter from "./routes/quickLessonRoute.js";
import adminRouter from "./routes/adminRoutes.js";
import adminUserRouter from "./routes/adminUserRoutes.js";
import connectDB from "./db/connectdb.js";
import cors from "cors";
import http from "http";
import dotenv from "dotenv";
import session from "express-session";
import { RedisStore } from "connect-redis";
import { createClient } from "redis";
// import apiRouter from "./routes/index.js";
import classRoutes from "./routes/classRoutes.js";
import assignmentRoutes from "./routes/assignmentRoutes.js";
import attendanceRoutes from "./routes/attendanceRoutes.js";
import alertnessRoutes from "./routes/alertnessRoutes.js";
import notificationRoutes from "./routes/notificationRoutes.js";
import fileRoutes from "./routes/fileRoutes.js";
import { initSocketServer } from "./sockets/index.js";

dotenv.config();

// Initialize Redis client.
const redisClient = createClient({
  url: process.env.REDIS_URL || "redis://localhost:6379",
});
redisClient.on("error", (err) => console.error("Redis Client Error", err));

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
const originUrl = process.env.ORIGIN_URL || "http://localhost:3002";

// Middleware configurations
app.use(
  cors({
    origin: originUrl,
    credentials: true,
  })
);
app.use("/images", express.static("public/images"));
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
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      sameSite: "None",
      maxAge: 24 * 60 * 60 * 1000, // 1 day
    },
  })
);

// Create HTTP server
const server = http.createServer(app);

// Initialize Socket.IO with your modular handlers
const io = initSocketServer(server, redisClient);

// Attach io instance to req for routes
const attachIo = (req, res, next) => {
  req.io = io;
  next();
};

app.use("/user", attachIo, userRouter);
app.use("/conversations", attachIo, conversationRouter);
app.use("/messages", attachIo, messageRouter);
app.use("/quick-messages", attachIo, quickMessageRouter);
app.use("/quick-lessons", quickLessonRouter);
app.use("/admin", adminRouter);
app.use("/admin/user-management", adminUserRouter);

app.use("/class-group/classes", classRoutes);
app.use("/class-group/assignments", assignmentRoutes);
app.use("/class-group/attendance", attendanceRoutes);
app.use("/class-group/alertness", alertnessRoutes);
app.use("/class-group/notification", notificationRoutes);
app.use("/class-group/flies", fileRoutes);
// ...existing code...

// Connect to DB and start server
connectDB(DATABASE_URL)
  .then(() => {
    server.listen(port, () => console.log(`Server running on port ${port}`));
  })
  .catch((err) => {
    console.error("Failed to connect to the database:", err);
    process.exit(1); // Exit the process with a failure code
  });
