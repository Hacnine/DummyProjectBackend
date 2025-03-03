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

  res.cookie('refresh_token_id', refreshTokenId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production', // Set to true in production
    sameSite: 'None',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  });
};

export const getToken = async (req) => {
  const { access_token_id, refresh_token_id } = req.cookies;
  const access_token = await redisClient.get(access_token_id);
  const refresh_token = await redisClient.get(refresh_token_id);
  return { access_token, refresh_token };
};

export const removeToken = async (res, req) => {
  const { access_token_id, refresh_token_id } = req.cookies;
  await redisClient.del(access_token_id);
  await redisClient.del(refresh_token_id);
  res.clearCookie('access_token_id');
  res.clearCookie('refresh_token_id');
};