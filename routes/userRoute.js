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
  searchUser,
  deleteUser,
  updateName,
  updateEmail,
  updatePassword,
  blockUser,
  unblockUser,
} from "../controllers/userController.js";
import { isLogin, isLogout } from "../middlewares/auth.middleware.js";
import rateLimit from "express-rate-limit";

const nameValidation = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Name is required')
    .isLength({ min: 2, max: 50 })
    .withMessage('Name must be between 2 and 50 characters')
];


// Validation middleware for email
const emailValidation = [
  body('email')
    .trim()
    .notEmpty()
    .withMessage('Email is required')
    .isEmail()
    .withMessage('Invalid email format')
    .normalizeEmail()
];

// Validation middleware for password
const passwordValidation = [
  body('password')
    .trim()
    .notEmpty()
    .withMessage('Password is required')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long')
];


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
userRouter.post("/logout", isLogin, logout);
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
userRouter.get("/search-user", isLogin, searchUser);
userRouter.get("/delete-user/:id", deleteUser);

userRouter.patch('/name', isLogin, nameValidation, updateName);
userRouter.patch('/email', isLogin, emailValidation, updateEmail);
userRouter.patch('/password', isLogin, passwordValidation, updatePassword);

userRouter.post("/block", isLogin, blockUser);
userRouter.delete("/block/:userId", isLogin, unblockUser);



export default userRouter;
