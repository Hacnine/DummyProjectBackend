import { createClient } from 'redis';

const redisClient = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379',
  socket: {
    reconnectStrategy: retries => {
      if (retries > 3) {
        return new Error('Retry limit exceeded');
      }
      return Math.min(retries * 50, 500);
    },
    connectTimeout: 10000  // Increase the connection timeout to 10 seconds
  }
});

redisClient.on('error', (err) => {
  console.error('Redis client error:', err);
});

redisClient.on('connect', () => {
  console.log('Redis client connected successfully');
});

(async () => {
  try {
    await redisClient.connect();
    console.log('Redis connection established');
  } catch (error) {
    console.error('Redis connection failed:', error);
  }
})();

export { redisClient };