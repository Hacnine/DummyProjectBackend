import jwt from "jsonwebtoken";
import { getToken, storeToken } from "../utils/redisTokenStore.js";

const isLogin = async (req, res, next) => {
  try {
    const { access_token, refresh_token } = await getToken(req);

    if (!access_token) return res.status(401).json({ message: "Unauthorized: Please log in." });

    jwt.verify(access_token, process.env.ACCESS_TOKEN_SECRET, async (err, decoded) => {
      if (err) {
        console.log("Access Token Error:", err.message);
        if (err.name === "TokenExpiredError" && refresh_token) {
          jwt.verify(refresh_token, process.env.REFRESH_TOKEN_SECRET, async (refreshErr, refreshDecoded) => {
            if (refreshErr) {
              console.log("Refresh Token Error:", refreshErr.message);
              return res.status(401).json({ message: "Unauthorized: Invalid refresh token" });
            }

            // Generate new access token
            const newAccessToken = jwt.sign({ id: refreshDecoded.id }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: "7m" });

            // Store new tokens
            if (!res.headersSent) {
              await storeToken(res, { access: newAccessToken, refresh: refresh_token }, refreshDecoded.id);
              console.log("New Access Token Generated:", newAccessToken);
            } else {
              console.error('Headers already sent');
            }

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
    const { access_token } = await getToken(req);
      // Clear previous cookies
      res.clearCookie("access_token", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "None" });
      res.clearCookie("refresh_token", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "None" });
      
    if (!access_token) {
      return next();
    }

    jwt.verify(access_token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
      if (err) {
        return next();
      } else {
        return res.status(403).json({ message: "You are already logged in." });
      }
    });
  } catch (error) {
    console.error("Internal server error:", error.message);
    return res.status(500).json({ message: "Internal server error." });
  }
};

export { isLogin, isLogout };