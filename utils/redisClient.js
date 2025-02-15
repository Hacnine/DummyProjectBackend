// redisClient.js
import redis from 'redis';
const client = redis.createClient();

client.on('error', (err) => {
  console.error('Redis error:', err);
});

// Function to set conversation state in Redis
const setConversationState = async (conversationId, state) => {
  await client.set(`conversation:${conversationId}:state`, state);
};

// Function to get conversation state from Redis
const getConversationState = async (conversationId) => {
  return new Promise((resolve, reject) => {
    client.get(`conversation:${conversationId}:state`, (err, result) => {
      if (err) {
        reject(err);
      } else {
        resolve(result);
      }
    });
  });
};

export { setConversationState, getConversationState };