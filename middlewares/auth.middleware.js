import jwt from "jsonwebtoken";
import { getToken, storeToken } from "../utils/redisTokenStore.js";
import User from "../models/userModel.js";

const isLogin = async (req, res, next) => {
  try {
    const { access_token, refresh_token } = await getToken(req);

    if (!access_token) {
      return res.status(401).json({ message: "Unauthorized: Please log in." });
    }

    try {
      const decoded = jwt.verify(access_token, process.env.ACCESS_TOKEN_SECRET);
      const user = await User.findById(decoded.id).select("-password -device_tokens -two_factor_auth.secret");
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      req.user = user;
      return next();
    } catch (err) {
      if (err.name === "TokenExpiredError" && refresh_token) {
        try {
          const refreshDecoded = jwt.verify(refresh_token, process.env.REFRESH_TOKEN_SECRET);
          const newAccessToken = jwt.sign({ id: refreshDecoded.id }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: "7d" });

          // Store new tokens
          await storeToken(res, { access: newAccessToken, refresh: refresh_token }, refreshDecoded.id);
          console.log("New Access Token Generated:", newAccessToken);

          req.user = refreshDecoded;
          return next();
        } catch (refreshErr) {
          console.log("Refresh Token Error:", refreshErr.message);
          return res.status(401).json({ message: "Unauthorized: Invalid refresh token" });
        }
      }
      return res.status(401).json({ message: "Unauthorized: Invalid token" });
    }
  } catch (error) {
    console.log("Middleware Error:", error);
    return res.status(500).json({ message: "Internal server error." });
  }
};

const isLogout = async (req, res, next) => {
  try {
    const { access_token, refresh_token } = await getToken(req);

    // Clear cookies and Redis tokens regardless of token validity
    res.clearCookie("access_token", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "None",
    });
    res.clearCookie("refresh_token", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "None",
    });

    if (access_token) {
      // Optionally, invalidate tokens in Redis
      // Assuming you have a function to delete tokens in redisTokenStore.js
      await deleteToken(access_token, refresh_token);
    }

    // Proceed to login regardless of previous token state
     next(); // Always move forward
  } catch (error) {
    console.error("isLogout error:", error.message);
    next(); // Never block login
  }
};

export { isLogin, isLogout };