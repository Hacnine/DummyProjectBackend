import jwt from "jsonwebtoken";
import { getToken, storeToken } from "../utils/localStorageService.js";

const isLogin = async (req, res, next) => {
  try {
    const { access_token, refresh_token } = await getToken(req);
    if (access_token) {
      jwt.verify(access_token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
          if (err.name === 'TokenExpiredError' && refresh_token) {
            jwt.verify(refresh_token, process.env.REFRESH_TOKEN_SECRET, async (refreshErr, refreshDecoded) => {
              if (refreshErr) {
                return res.status(401).json({ message: "Unauthorized: Invalid refresh token" });
              }
              const newAccessToken = jwt.sign({ id: refreshDecoded.id }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '15m' });
              await storeToken(res, { access: newAccessToken, refresh: refresh_token });
              req.user = refreshDecoded;
              next();
            });
          } else {
            return res.status(401).json({ message: "Unauthorized: Invalid token" });
          }
        } else {
          req.user = decoded;
          next();
        }
      });
    } else {
      res.status(401).json({ message: "Unauthorized: Please log in." });
    }
  } catch (error) {
    res.status(500).json({ message: "Internal server error." });
  }
};

const isLogout = async (req, res, next) => {
  try {
    const { access_token } = await getToken(req);
    if (!access_token) {
      next();
    } else {
      jwt.verify(access_token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
          // Token is invalid or expired, allow login
          next();
        } else {
          // Token is valid, block login
          res.status(403).json({ message: "You are already logged in." });
        }
      });
    }
  } catch (error) {
    res.status(500).json({ message: "Internal server error." });
  }
};

export { isLogin, isLogout };