import express from "express";
import bodyParser from "body-parser";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import {
  register,
  login,
  logout,
  getAllUsers,
  getOnlineUsers,
} from "../controllers/userController.js";
import { isLogin, isLogout } from "../middlewares/auth.middleware.js";
import session from "express-session";
import dotenv from "dotenv";
dotenv.config();

const userRouter = express.Router();
const { SESSION_SECRET } = process.env;
userRouter.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      maxAge: 3600000,
    },
  })
);

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

userRouter.use(bodyParser.json());
userRouter.use(bodyParser.urlencoded({ extended: true }));

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

userRouter.post("/register", upload.single("image"), register);
userRouter.post("/login", isLogout, login);
userRouter.get("/logout", isLogin, logout);

userRouter.get("/allusers", isLogin, getAllUsers);
userRouter.get("/onlineusers", isLogin, getOnlineUsers);

export default userRouter;