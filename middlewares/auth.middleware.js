import jwt from "jsonwebtoken";
import { getToken, storeToken } from "../utils/localStorageService.js";

const isLogin = (req, res, next) => {
  try {
    const { access_token, refresh_token } = getToken(req);
    console.log("Access Token:", access_token);
    console.log("Refresh Token:", refresh_token);
    
    if (!access_token) return res.status(401).json({ message: "Unauthorized: Please log in." });

    jwt.verify(access_token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
      if (err) {
        console.log("Access Token Error:", err.message);
        if (err.name === 'TokenExpiredError' && refresh_token) {
          jwt.verify(refresh_token, process.env.REFRESH_TOKEN_SECRET, (refreshErr, refreshDecoded) => {
            if (refreshErr) {
              console.log("Refresh Token Error:", refreshErr.message);
              return res.status(401).json({ message: "Unauthorized: Invalid refresh token" });
            }
            const newAccessToken = jwt.sign({ id: refreshDecoded.id }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '7m' });
            console.log("New Access Token Generated:", newAccessToken);
            storeToken(res, { access: newAccessToken, refresh: refresh_token });
            req.user = refreshDecoded;
            return next();
          });
        } else {
          return res.status(401).json({ message: "Unauthorized: Invalid token" });
        }
      } else {
        req.user = decoded;
        next();
      }
    });
  } catch (error) {
    console.log("Middleware Error:", error);
    res.status(500).json({ message: "Internal server error." });
  }
};


const isLogout = async (req, res, next) => {
  try {
    const { access_token_id } = await getToken(req);
    console.log("Access Token (Logout):", access_token_id);

    if (!access_token_id) {
      next();
    } else {
      jwt.verify(access_token_id, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
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
    console.error("Internal server error:", error.message);
    res.status(500).json({ message: "Internal server error." });
  }
};

export { isLogin, isLogout };