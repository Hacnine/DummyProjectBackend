import userModel from "../models/userModel.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { storeToken, getToken, removeToken } from "../utils/redisTokenStore.js";
import { redisClient } from "../utils/redisClient.js";
import { validationResult } from 'express-validator';
import { fileURLToPath } from "url";
import path from "path";

const register = async (req, res) => {
  try {
    const { name, email, password, gender } = req.body;
    if (!name || !email || !password || !gender) {
      return res.status(400).json({ message: "All fields are required." });
    }
    const existingUser = await userModel.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "User already exists." });
    }
    const passwordHash = await bcrypt.hash(password, 10);
    // let image = "";
    // if (gender.trim() === "male") {
    //   console.log("gender:", gender.trim());

    //   image = "/images/avatar/default-avatar.svg";
    // } else if (gender.trim() === "female") {
    //   image = "/images/avatar/womanav10.svg";
    // } else {
    //   image = "/images/avatar/default-avatar.svg";
    // }

    const user = new userModel({
      name,
      email,
      password: passwordHash,
      gender,
      // image,
    });
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
    const userId = user._id;
    storeToken(res, { access: accessToken, refresh: refreshToken }, userId);

    // Emit the loggedUsersUpdate event
    const getAllUsers = await userModel.find({});
    req.io.emit("getAllUsersUpdate", getAllUsers);

    res.status(201).json({ message: "User registered successfully", user });
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
     
       // Clear previous cookies
       res.clearCookie("access_token", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "None" });
       res.clearCookie("refresh_token", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "None" });
 
       // Remove old tokens from Redis
       await redisClient.del(`access_token_${user._id}`);
       await redisClient.del(`refresh_token_${user._id}`);
 
       // Generate new tokens
       

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
      const userId = user._id.toString();
      await storeToken(
        res,
        { access: accessToken, refresh: refreshToken },
        userId
      );

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
    await removeToken(res, req); // Ensure the function is called with both `res` and `req`

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
    const filteredUsers = users.filter(
      (user) => user._id.toString() !== req.user.id
    ); // Exclude logged-in user
    res.json(filteredUsers);
  } catch (error) {
    res.status(500).json({ message: "Error fetching users" });
  }
};

const getUserInfo = async (req, res) => {
  try {
    const { userId } = req.params;
    const cacheKey = `user:${userId}`;

    // Check if user data exists in Redis
    const cachedUser = await redisClient.get(cacheKey);
    if (cachedUser) {
      // console.log("User found in cache:", cachedUser); //  Debugging log
      return res.json(JSON.parse(cachedUser)); //  Ensure response is sent
    }

    // Fetch from MongoDB if not in cache
    const user = await userModel.findById(userId).select("-password").lean();
    if (!user) {
      // console.log("User not found in DB"); //  Debugging log
      return res.status(404).json({ message: "User not found" }); //  Send 404 response
    }

    // Store in Redis with 1-hour expiration
    await redisClient.set(cacheKey, JSON.stringify(user), "EX", 3600);
    // console.log("User stored in cache:", user); //  Debugging log

    return res.json(user); //  Ensure response is sent
  } catch (error) {
    console.error("Error fetching user info:", error);
    return res.status(500).json({ message: "Failed to get user info" }); //  Return proper error response
  }
};


const updateUserInfo = async (req, res) => {
  const { userId } = req.params;
  const updateData = req.body;
 // Decode the URL if it contains HTML entities
//  console.log(updateData.image)
 if (updateData.image) {
  updateData.image = decodeURIComponent(updateData.image);
}

// Validate and sanitize input
const errors = validationResult(req);
if (!errors.isEmpty()) {
  return res.status(400).json({ errors: errors.array() });
}

try {
  const updatedUser = await userModel.findByIdAndUpdate(
    userId,
    { $set: updateData },
    { new: true, runValidators: true }
  );

  if (!updatedUser) {
    return res.status(404).json({ message: 'User not found' });
  }

  res.json(updatedUser);
  } catch (error) {
    res.status(500).json({ message: 'Error updating user information', error: error.message });
  }
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
    const userId = decoded._id.toString();
    await storeToken(
      res,
      { access: accessToken, refresh: refreshToken },
      userId
    );
    res.status(200).json({ accessToken });
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({ message: "Refresh token expired" });
    }
    if (error.name === "JsonWebTokenError") {
      return res.status(401).json({ message: "Invalid refresh token" });
    }
    res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
};

export { register, login, logout, getAllUsers, getUserInfo, updateUserInfo, refreshToken };
