import jwt from 'jsonwebtoken';

const storeToken = (res, token) => {
  const { access, refresh } = token;
  res.cookie('access_token', access, { httpOnly: true, secure: process.env.NODE_ENV === 'production' });
  res.cookie('refresh_token', refresh, { httpOnly: true, secure: process.env.NODE_ENV === 'production' });
};

const getToken = (req) => {
  const access_token = req.cookies['access_token'];
  const refresh_token = req.cookies['refresh_token'];
  return { access_token, refresh_token };
};

const removeToken = (res) => {
  res.clearCookie('access_token');
  res.clearCookie('refresh_token');
};

export { storeToken, getToken, removeToken };