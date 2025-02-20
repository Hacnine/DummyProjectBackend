import userModel from "../models/userModel.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import {
  storeToken,
  getToken,
  removeToken,
} from "../utils/localStorageService.js";
import {redisClient} from "../utils/redisClient.js";

const register = async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ message: "All fields are required." });
    }
    const existingUser = await userModel.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "User already exists." });
    }
    const passwordHash = await bcrypt.hash(password, 10);

    const user = new userModel({ name, email, password: passwordHash });
    await user.save();

    const accessToken = jwt.sign(
      { id: user._id },
      process.env.ACCESS_TOKEN_SECRET,
      { expiresIn: "7d" }
    );
    const refreshToken = jwt.sign(
      { id: user._id },
      process.env.REFRESH_TOKEN_SECRET,
      { expiresIn: "7d" }
    );
    storeToken(res, { access: accessToken, refresh: refreshToken });

    // Emit the loggedUsersUpdate event
    const getAllUsers = await userModel.find({});
    req.io.emit("getAllUsersUpdate", getAllUsers);

    res
      .status(201)
      .json({ message: "User registered successfully", user, accessToken });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
};

const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res
        .status(400)
        .json({ message: "Email and password are required." });
    }
    const user = await userModel.findOne({ email });
    if (user && (await bcrypt.compare(password, user.password))) {
      const accessToken = jwt.sign(
        { id: user._id },
        process.env.ACCESS_TOKEN_SECRET,
        { expiresIn: "7d" }
      );
      const refreshToken = jwt.sign(
        { id: user._id },
        process.env.REFRESH_TOKEN_SECRET,
        { expiresIn: "7d" }
      );
      storeToken(res, { access: accessToken, refresh: refreshToken });

      // Emit the loggedUsersUpdate event
      req.io.emit("loggedUsersUpdate", Array.from(req.onlineUsers));

      res.status(200).json({ message: "Login successful", user, accessToken });
    } else {
      res.status(401).json({ message: "Email or Password is incorrect." });
    }
  } catch (error) {
    res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
};

const logout = async (req, res) => {
  try {
    removeToken(res);
    res.status(200).json({ message: "Logged out successfully." });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
};

const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    // Delete user from the database
    await userModel.findByIdAndDelete(id);

    // Emit the updated user list
    const allUsers = await userModel.find({});
    req.io.emit("getAllUsersUpdate", allUsers);

    res.status(200).json({ message: "User deleted successfully." });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
};

const getAllUsers = async (req, res) => {
  try {
    const users = await userModel.find({}, "-password"); // Fetch all users
    const filteredUsers = users.filter(user => user._id.toString() !== req.user.id); // Exclude logged-in user
    res.json(filteredUsers);
  } catch (error) {
    res.status(500).json({ message: "Error fetching users" });
  }
};



const getUserInfo = async (userId) => {
  const cacheKey = `user:${userId}`;

  // Check if user data exists in Redis
  const cachedUser = await redisClient.get(cacheKey);
  if (cachedUser) {
    return JSON.parse(cachedUser); // Return cached user data
  }

  // Fetch from MongoDB if not in cache
  const user = await userModel.findById(userId).select("name image");
  if (!user) return null;

  // Store in Redis with 1-hour expiration
  await redisClient.set(cacheKey, JSON.stringify(user), "EX", 3600);

  return user;
};


const refreshToken = async (req, res) => {
  try {
    const { refresh_token } = getToken(req);
    if (!refresh_token) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const decoded = jwt.verify(refresh_token, process.env.REFRESH_TOKEN_SECRET);
    const accessToken = jwt.sign(
      { id: decoded.id },
      process.env.ACCESS_TOKEN_SECRET,
      { expiresIn: "15m" }
    );
    storeToken(res, { access: accessToken, refresh: refresh_token });
    res.status(200).json({ accessToken });
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: "Refresh token expired" });
    }
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ message: "Invalid refresh token" });
    }
    res.status(500).json({ message: "Internal server error", error: error.message });
  }
};

export { register, login, logout, getAllUsers, refreshToken };