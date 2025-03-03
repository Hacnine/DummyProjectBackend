import { createClient } from '@redis/client';

const redisClient = createClient({
  url: process.env.REDIS_URL,
});
redisClient.connect().catch(console.error);

export const storeToken = async (res, { access, refresh }) => {
  const accessTokenId = `access_${Date.now()}`;
  const refreshTokenId = `refresh_${Date.now()}`;

  await redisClient.set(accessTokenId, access, {
    EX: 15 * 60, // 15 minutes
  });
  await redisClient.set(refreshTokenId, refresh, {
    EX: 7 * 24 * 60 * 60, // 7 days
  });

  res.cookie('access_token_id', accessTokenId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production', // Set to true in production
    sameSite: 'None',
    maxAge: 15 * 60 * 1000, // 15 minutes
  });

  res.cookie('refresh_token', refresh, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production', // Set to true in production
    sameSite: 'None',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  });
};

export const getToken = (req) => {
  const { access_token, refresh_token } = req.cookies;
  return { access_token, refresh_token };
};

export const removeToken = (res) => {
  res.clearCookie('access_token');
  res.clearCookie('refresh_token');
};

