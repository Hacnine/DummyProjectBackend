import { createClient } from "redis";
import logger from "../utils/logger.js"; // Assuming logger is in utils/logger.js

// Initialize Redis client
const redisClient = createClient({
  url: process.env.REDIS_URL || "redis://localhost:6379",
});

// Handle Redis errors
redisClient.on("error", (err) => {
  logger.error({ err }, "Redis Client Error");
});

// Function to connect to Redis
export const connectRedis = async () => {
  try {
    if (!redisClient.isOpen) {
      await redisClient.connect();
      logger.info("Redis connected successfully");
    }
    return redisClient;
  } catch (err) {
    logger.error({ err }, "Failed to connect to Redis");
    throw err; // Let the caller handle the error
  }
};

// Function to get the Redis client instance
export const getRedisClient = () => {
  if (!redisClient.isOpen) {
    throw new Error("Redis client is not connected");
  }
  return redisClient;
};