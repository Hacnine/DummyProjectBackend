import "dotenv/config";
import express from "express";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import cors from "cors";
import cookieParser from "cookie-parser";
import compression from "compression";
import session from "express-session";
import { RedisStore } from "connect-redis";
import pinoHttp from "pino-http";
import helmet from "helmet";
import rateLimit from "express-rate-limit";

// Config & utils
import { connectDB } from "./db/connectdb.js";
import { connectRedis } from "./config/redisClient.js";
import logger from "./utils/logger.js";
import messageCleanupJob from "./schedulers/messageCleanupJob.js";
import { startCronJobs } from "./schedulers/sessionCreationJob.js";
import { startCronJobsForScheduledDeletion } from "./schedulers/scheduledDeletionJob.js";
import { initialSocketServer } from "./sockets/socketindex.js";

// Routes
import userRouter from "./routes/userRoute.js";
import conversationRouter from "./routes/conversationRoute.js";
import messageRouter from "./routes/messageRoute.js";
import quickMessageRouter from "./routes/quickMessageRoute.js";
import quickLessonRouter from "./routes/quickLessonRoute.js";
import adminRouter from "./routes/adminRoutes.js";
import adminUserRouter from "./routes/adminUserRoutes.js";
import classRoutes from "./routes/classRoutes.js";
import assignmentRoutes from "./routes/assignmentRoutes.js";
import attendanceRoutes from "./routes/attendanceRoutes.js";
import alertnessRoutes from "./routes/alertnessRoutes.js";
import notificationRoutes from "./routes/notificationRoutes.js";
import fileRoutes from "./routes/fileRoutes.js";
import socialRoutes from "./routes/socialRoutes.js";
import { apiLimiter } from "./middlewares/rateLimiter.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
let io; // Declare io for export

(async () => {
  try {
    const port = process.env.PORT || 3001;
    const DATABASE_URL = process.env.DATABASE_URL;

    // Connect DB & Redis
    await connectDB(DATABASE_URL);
    const redis = await connectRedis();

    // Core middlewares
    // app.use(pinoHttp({ logger }));
    app.use(helmet());
    app.use(compression());

    const allowedOrigins = (process.env.ORIGIN_URLS || "http://localhost:3002")
      .split(",")
      .map((origin) => origin.trim());
    app.use(
      cors({
        origin: (origin, callback) => {
          // Allow requests with no origin (like mobile apps or curl)
          if (!origin) return callback(null, true);
          if (allowedOrigins.includes(origin)) {
            return callback(null, true);
          }
          return callback(new Error("Not allowed by CORS"));
        },
        credentials: true,
      })
    );

    app.use(
      "/images",
      express.static(path.join(process.cwd(), "public/images"))
    );
    app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

    app.use(express.json({ limit: "10mb" }));
    app.use(express.urlencoded({ extended: true }));
    app.use(cookieParser());

    // Sessions (Redis)
    app.use(
      session({
        store: new RedisStore({ client: redis, prefix: "alfajr:sess:" }),
        secret: process.env.SESSION_SECRET,
        resave: false,
        saveUninitialized: false,
        cookie: {
          secure: process.env.NODE_ENV === "production",
          httpOnly: true,
          sameSite: "none",
          maxAge: 24 * 60 * 60 * 1000,
        },
        name: "sid",
      })
    );

    // Socket.IO
    const server = http.createServer(app);
    io = await initialSocketServer(server, redis);

    // Attach io to requests
    const attachIo = (req, _res, next) => {
      req.io = io;
      next();
    };

    // Routes
    app.use("/user", apiLimiter, attachIo, userRouter);
    app.use("/conversations", apiLimiter, attachIo, conversationRouter);
    app.use("/messages", apiLimiter, attachIo, messageRouter);
    app.use("/quick-messages", apiLimiter, attachIo, quickMessageRouter);
    app.use("/quick-lessons", apiLimiter, quickLessonRouter);
    app.use("/admin", apiLimiter, adminRouter);
    app.use("/admin/user-management", apiLimiter, attachIo, adminUserRouter);
    app.use("/class-group/classes", apiLimiter, attachIo, classRoutes);
    app.use("/class-group/assignments", apiLimiter, attachIo, assignmentRoutes);
    app.use("/class-group/attendance", apiLimiter, attachIo, attendanceRoutes);
    app.use("/class-group/alertness", apiLimiter, attachIo, alertnessRoutes);
    app.use(
      "/class-group/notification",
      apiLimiter,
      attachIo,
      notificationRoutes
    );
    app.use("/class-group/files", apiLimiter, fileRoutes);
    app.use("/social", apiLimiter, attachIo, socialRoutes);

    // Health check
    app.get("/health", (req, res) => res.status(200).send("OK"));

    // 404
    app.use((req, res) =>
      res.status(404).json({ success: false, message: "Route not found" })
    );

    // Error handler
    app.use((err, req, res, next) => {
      logger.error({ err, url: req.originalUrl }, "Unhandled error");
      res
        .status(err.status || 500)
        .json({ success: false, message: err.message || "Server Error" });
    });

    // Start schedulers
    messageCleanupJob.start();
    startCronJobs();
    startCronJobsForScheduledDeletion();

    // Start server
    server.listen(port, () => logger.info(`Server running on port ${port}`));

    // Graceful shutdown
    const shutdown = (signal) => async () => {
      logger.info(`${signal} received, shutting down gracefully...`);
      server.close(() => {
        logger.info("HTTP server closed");
        process.exit(0);
      });
      setTimeout(() => {
        logger.error("Force exiting after 10s");
        process.exit(1);
      }, 10000);
    };

    process.on("SIGINT", shutdown("SIGINT"));
    process.on("SIGTERM", shutdown("SIGTERM"));
  } catch (err) {
    logger.error({ err }, "Fatal boot error");
    process.exit(1);
  }
})();

export { app, io };
