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

// Config & utils
import { connectDB } from "./db/connectdb.js";
import { connectRedis } from "./config/redisClient.js";
import logger from "./utils/logger.js";
import messageCleanupJob from "./schedulers/messageCleanupJob.js";
import { startCronJobs } from "./schedulers/sessionCreationJob.js";
import { startCronJobsForScheduledDeletion } from "./schedulers/scheduledDeletionJob.js";
import { startEncryptionKeyRotation } from "./schedulers/encryptionKeyRotationJob.js";
import { initializeEncryptionKeys } from "./services/backendEncryptionService.js";
import { initialSocketServer } from "./sockets/socketIndex.js";
import routeIndex from "./routes/routeIndex.js";
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
    
    // Initialize backend encryption keys
    await initializeEncryptionKeys();
    logger.info('🔐 Backend encryption service initialized');

    // Core middlewares
    // app.use(pinoHttp({ logger }));
    app.use(helmet());
    app.use(compression());

    const allowedOrigins = process.env.ORIGIN_URL.split(',').map(s => s.trim());
    app.use(cors({ origin: allowedOrigins, credentials: true }));

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
    app.use("/", apiLimiter, attachIo, routeIndex);
   
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
    startEncryptionKeyRotation();
    logger.info('🕐 All cron jobs started including encryption key rotation');

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
