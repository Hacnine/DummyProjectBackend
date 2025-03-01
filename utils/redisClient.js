import { createClient } from 'redis';

const redisClient = createClient({
  url:  'redis://localhost:6379',
});

redisClient.on('error', (err) => {
  console.error('Redis client error:', err);
});

redisClient.on('connect', () => {
  console.log('Redis client connected!');
});

redisClient.connect().catch(console.error);

const setConversationState = async (conversationId, state) => {
  try {
    await redisClient.set(conversationId, state);
  } catch (error) {
    console.error('Error setting conversation state in Redis:', error);
  }
};

export { setConversationState, redisClient };