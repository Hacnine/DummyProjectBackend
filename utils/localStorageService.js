export const storeToken = (res, { access, refresh }) => {
  res.cookie('access_token', access, {
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

export { storeToken, getToken, removeToken };
