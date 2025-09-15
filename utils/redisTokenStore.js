import jwt from 'jsonwebtoken';
import { redisClient } from './redisClient.js';

const storeToken = async (res, token, userId) => {
  const { access, refresh } = token;
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: "/",
    domain: process.env.NODE_ENV === "production" ? process.env.COOKIE_DOMAIN : undefined
  };

  await redisClient.set(`access_token_${userId}`, access, { EX: 60 * 60 * 24 * 7 });
  await redisClient.set(`refresh_token_${userId}`, refresh, { EX: 60 * 60 * 24 * 7 });

  if (!res.headersSent) {
    res.cookie("access_token", access, cookieOptions);
    res.cookie("refresh_token", refresh, cookieOptions);
    console.log('Cookies set:', { access_token: access, refresh_token: refresh });
  } else {
    console.error("Headers already sent during storeToken");
  }
};

const getToken = async (req) => {
  const cookies = req.cookies || {};
  console.log('Cookies received:', cookies);
  const access_token = cookies.access_token || null;
  const refresh_token = cookies.refresh_token || null;

  if (!access_token) {
    return { access_token: null, refresh_token };
  }

  try {
    const decoded = jwt.verify(access_token, process.env.ACCESS_TOKEN_SECRET);
    const userId = decoded.id;

    const storedAccess = await redisClient.get(`access_token_${userId}`);
    const storedRefresh = await redisClient.get(`refresh_token_${userId}`);
    console.log('Redis tokens:', { storedAccess, storedRefresh });

    return {
      access_token: storedAccess || access_token,
      refresh_token: storedRefresh || refresh_token
    };
  } catch (error) {
    console.error("Token Decode Error:", { message: error.message, stack: error.stack });
    return { access_token: null, refresh_token };
  }
};

const removeToken = async (res, req) => {
  try {
    const { access_token, refresh_token } = req.cookies || {};
    if (!access_token && !refresh_token) {
      return;
    }

    let userId = null;
    if (access_token) {
      const decoded = jwt.decode(access_token);
      userId = decoded?.id;
    }

    if (userId) {
      await redisClient.del(`access_token_${userId}`);
      await redisClient.del(`refresh_token_${userId}`);
    }

    if (!res.headersSent) {
      res.clearCookie("access_token", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
        path: "/"
      });
      res.clearCookie("refresh_token", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
        path: "/"
      });
    }
  } catch (error) {
    console.error("Error during logout:", { message: error.message, stack: error.stack });
    throw error;
  }
};

export { storeToken, getToken, removeToken };