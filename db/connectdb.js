import mongoose from "mongoose";
import logger from "../utils/logger.js";

const DB_OPTIONS = {
  dbName: process.env.DB_NAME,
  autoIndex: false, // Disable in prod; use migrations or ensureIndexes on startup
  maxPoolSize: 50,
  minPoolSize: 5,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
};

export const connectDB = async (DATABASE_URL) => {
  let attempts = 0;
  const maxAttempts = 10;
  const retryDelay = 5000;

  while (attempts < maxAttempts) {
    try {
      await mongoose.connect(DATABASE_URL, DB_OPTIONS);
      logger.info("Connected to MongoDB");
      return mongoose.connection;
    } catch (err) {
      attempts += 1;
      logger.error({ err, attempts }, "MongoDB connection failed");
      if (attempts >= maxAttempts) throw err;
      await new Promise((res) => setTimeout(res, retryDelay));
    }
  }
};

export const disconnectDB = async () => {
  await mongoose.disconnect();
};
