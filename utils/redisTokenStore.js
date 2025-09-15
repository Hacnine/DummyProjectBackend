import jwt from 'jsonwebtoken';
import { redisClient } from './redisClient.js';

const storeToken = async (res, token, userId) => {
  const { access, refresh } = token;
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production" ? true : false,
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: "/",
  };

  // Store in Redis
  await redisClient.set(`access_token_${userId}`, access, { EX: 60 * 60 * 24 * 7 }); // 7 days
  await redisClient.set(`refresh_token_${userId}`, refresh, { EX: 60 * 60 * 24 * 7 });

  if (!res.headersSent) {
    res.cookie("access_token", access, cookieOptions);
    res.cookie("refresh_token", refresh, cookieOptions);
  } else {
    console.error("Headers already sent");
  }
};

const getToken = async (req) => {
  const cookies = req.cookies || {}; // Fallback to empty object if req.cookies is undefined
  const access_token = cookies.access_token || null;
  const refresh_token = cookies.refresh_token || null;
  // If no access_token, return both as null or keep refresh_token
  if (!access_token) {
    return { access_token: null, refresh_token };
  }

  try {
    const decoded = jwt.verify(access_token, process.env.ACCESS_TOKEN_SECRET);
    const userId = decoded.id;

    // Fetch tokens from Redis by user ID
    const storedAccess = await redisClient.get(`access_token_${userId}`);
    const storedRefresh = await redisClient.get(`refresh_token_${userId}`);

    return {
      access_token: storedAccess || access_token, // Fallback to cookie if Redis has no token
      refresh_token: storedRefresh || refresh_token, // Fallback to cookie if Redis has no token
    };
  } catch (error) {
    console.error("Token Decode Error:", error.message);
    return { access_token: null, refresh_token }; // Keep refresh_token for potential refresh
  }
};

const removeToken = async (res, req) => {
  try {
    const { access_token, refresh_token } = req.cookies;
    if (!access_token && !refresh_token) {
      return res.status(400).json({ message: "No tokens found" });
    }

    let userId = null;
    if (access_token) {
      const decoded = jwt.decode(access_token); // decode instead of verify
      userId = decoded?.id;
    }

    if (userId) {
      await redisClient.del(`access_token_${userId}`);
      await redisClient.del(`refresh_token_${userId}`);
    }

    if (!res.headersSent) {
      res.clearCookie("access_token");
      res.clearCookie("refresh_token");
    }

    return res.json({ message: "Logout successful" });
  } catch (error) {
    console.error("Error during logout:", error.message);
    return res.status(500).json({ message: "Server error", error: error.message });
  }
};


export { storeToken, getToken, removeToken };