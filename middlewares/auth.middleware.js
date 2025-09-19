import jwt from "jsonwebtoken";
import { getToken, removeToken, storeToken } from "../utils/redisTokenStore.js";
import User from "../models/userModel.js";


const isLogin = async (req, res, next) => {
  try {
    const authHeader = req.headers["authorization"];
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Unauthorized: No token provided." });
    }

    const token = authHeader.split(" ")[1];

    try {
      const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);

      const user = await User.findById(decoded.id).select(
        "-password -device_tokens -two_factor_auth.secret"
      );
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      req.user = user;
      return next();
    } catch (err) {
      if (err.name === "TokenExpiredError") {
        return res.status(401).json({ message: "Unauthorized: Token expired" });
      }
      return res.status(401).json({ message: "Unauthorized: Invalid token" });
    }
  } catch (error) {
    console.error("Middleware Error:", error);
    return res.status(500).json({ message: "Internal server error." });
  }
};

export default isLogin;


const isLogout = async (req, res, next) => {
  try {
    // Clear tokens and session
    await removeToken(res, req);
    req.session.destroy((err) => {
      if (err) console.error("Session destroy error:", { message: err.message, stack: err.stack });
    });
    next();
  } catch (error) {
    console.error("isLogout error:", { message: error.message, stack: error.stack });
    next(); // Never block login
  }
};


export { isLogin, isLogout };