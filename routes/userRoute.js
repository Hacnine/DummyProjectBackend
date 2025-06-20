import express from "express";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import { body } from "express-validator";
import {
  register,
  login,
  logout,
  getAllUsers,
  refreshToken,
  getUserInfo,
  updateUserInfo,
  updateUserThemeIndex,
  getUserThemeIndex,
} from "../controllers/userController.js";
import { isLogin, isLogout } from "../middlewares/auth.middleware.js";
import rateLimit from "express-rate-limit";

// Rate Limiting Middleware
const generalLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 10, // Limit each IP to 10 requests
  message: "Too many login attempts, please try again later.",
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
userRouter.post("/login", isLogout, login);
userRouter.get("/logout", isLogin, logout);
userRouter.get("/me", isLogin, (req, res) => {
  res.json({ user: req.user });
});

userRouter.get("/allusers", isLogin, getAllUsers);
userRouter.patch(
  "/update/:userId",
  isLogin,
  [
    body("name").optional().isString().trim().escape(),
    body("email").optional().isEmail().normalizeEmail(),
    body("password").optional().isLength({ min: 1 }).trim().escape(),
    body("gender").optional().isIn(["male", "female", "other"]).trim().escape(),
    body("image").optional().trim(),
  ],
  updateUserInfo
);
userRouter.get("/userinfo/:userId", isLogin, getUserInfo);
userRouter.get("/theme-index", isLogin, getUserThemeIndex);
userRouter.patch("/theme-index", isLogin, updateUserThemeIndex);



export default userRouter;
