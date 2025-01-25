import jwt from "jsonwebtoken";
import { getToken } from "../utils/localStorageService.js";

const isLogin = (req, res, next) => {
  try {
    const { access_token } = getToken(req);
    if (access_token) {
      jwt.verify(access_token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
          return res.status(401).json({ message: "Unauthorized: Invalid token" });
        }
        req.user = decoded;
        next();
      });
    } else {
      res.status(401).json({ message: "Unauthorized: Please log in." });
    }
  } catch (error) {
    res.status(500).json({ message: "Internal server error." });
  }
};

const isLogout = (req, res, next) => {
  try {
    const { access_token } = getToken(req);
    if (!access_token) {
      next();
    } else {
      res.status(403).json({ message: "You are already logged in." });
    }
  } catch (error) {
    res.status(500).json({ message: "Internal server error." });
  }
};

export { isLogin, isLogout };