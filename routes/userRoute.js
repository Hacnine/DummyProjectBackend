import express from "express";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import {
  register,
  login,
  logout,
  getAllUsers,
  refreshToken,
  getUserInfo,
} from "../controllers/userController.js";
import { isLogin, isLogout } from "../middlewares/auth.middleware.js";
import rateLimit from "express-rate-limit";

// Rate Limiting Middleware
const generalLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 100, // Limit each IP to 100 requests
  message: "Too many requests, please try again later.",
});

// Initialize express router
const userRouter = express.Router();

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, "../public/images"));
  },
  filename: function (req, file, cb) {
    cb(
      null,
      file.fieldname + "-" + Date.now() + path.extname(file.originalname)
    );
  },
});

const upload = multer({ storage: storage });

userRouter.get("/refresh-token", refreshToken);
userRouter.post("/register", upload.single("image"), register);
userRouter.post("/login", generalLimiter, isLogout, login);
userRouter.get("/logout", isLogin, logout);

userRouter.get("/allusers", isLogin, getAllUsers);
userRouter.get("/userinfo/:userId", isLogin, getUserInfo);

export default userRouter;