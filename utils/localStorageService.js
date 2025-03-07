import jwt from 'jsonwebtoken';
import { redisClient } from './redisClient.js';

const storeToken = async (res, token, userId) => {
  const { access, refresh } = token;
  // Store in Redis with user ID as the key
  await redisClient.set(`access_token_${userId}`, access, { EX: 60 * 60 * 24 * 7 }); // 7 days
  await redisClient.set(`refresh_token_${userId}`, refresh, { EX: 60 * 60 * 24 * 7 });

  if (!res.headersSent) {

    res.cookie("access_token", access, { httpOnly: true, secure: process.env.NODE_ENV === "production" });
    res.cookie("refresh_token", refresh, { httpOnly: true, secure: process.env.NODE_ENV === "production" });
  } else {
    console.error('Headers already sent');
  }
};

const getToken = async (req) => {
  const access_token = req.cookies["access_token"];
  const refresh_token = req.cookies["refresh_token"];
  if (!access_token) return { access_token: null, refresh_token: null };

  try {
    const decoded = jwt.verify(access_token, process.env.ACCESS_TOKEN_SECRET);
    const userId = decoded.id;

    // Fetch tokens by user ID instead of using the token itself
    const storedAccess = await redisClient.get(`access_token_${userId}`);
    const storedRefresh = await redisClient.get(`refresh_token_${userId}`);

    console.log("Tokens from Redis:", storedAccess, storedRefresh);

    return { access_token: storedAccess, refresh_token: storedRefresh };
  } catch (error) {
    console.error("Token Decode Error:", error.message);
    return { access_token: null, refresh_token: null };
  }
};

const removeToken = async (res, req) => {
  try {
    const { access_token, refresh_token } = req.cookies;
    
    if (!access_token || !refresh_token) {
      return res.status(400).json({ message: "No tokens found" });
    }

    const decoded = jwt.verify(access_token, process.env.ACCESS_TOKEN_SECRET);
    const userId = decoded.id;

    // Delete tokens from Redis using user ID
    await redisClient.del(`access_token_${userId}`);
    await redisClient.del(`refresh_token_${userId}`);

    if (!res.headersSent) {
      res.clearCookie("access_token");
      res.clearCookie("refresh_token");
    } else {
      console.error("Headers already sent");
    }
  } catch (error) {
    console.error("Error during logout:", error.message);
  }
};


export { storeToken, getToken, removeToken };