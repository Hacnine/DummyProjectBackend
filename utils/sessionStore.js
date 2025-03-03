import session from 'express-session';
import { redisClient } from './redisClient.js';
import EventEmitter from 'events';

class RedisStore extends EventEmitter {
  constructor() {
    super();
  }

  async get(sid, cb) {
    try {
      const data = await redisClient.get(`session:${sid}`);
      cb(null, data ? JSON.parse(data) : null);
    } catch (err) {
      cb(err);
    }
  }

  async set(sid, sessionData, cb) {
    try {
      await redisClient.set(`session:${sid}`, JSON.stringify(sessionData), {
        EX: 86400, // Expire in 24 hours
      });
      cb(null);
    } catch (err) {
      cb(err);
    }
  }

  async destroy(sid, cb) {
    try {
      await redisClient.del(`session:${sid}`);
      cb(null);
    } catch (err) {
      cb(err);
    }
  }
}

const redisStore = new RedisStore();
export { redisStore };
