import userModel from "../models/userModel.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { storeToken, getToken, removeToken } from "../utils/redisTokenStore.js";
import { redisClient } from "../utils/redisClient.js";
import { validationResult } from "express-validator";
import { fileURLToPath } from "url";
import path from "path";
import User from "../models/userModel.js";
import { onlineUsers } from "../sockets/onlineUserSocket.js";
import { createUserApproval } from "../utils/userApprovalMiddleware.js";
import AdminSettings from "../models/adminSettingsModel.js";

const register = async (req, res) => {
  try {
    const settings = await AdminSettings.findOne();
    // Allow registration if settings don't exist (initial setup) or if user_registration is true
    const isRegistrationGloballyEnabled = !settings || settings.features?.user_registration !== false;

    if (!isRegistrationGloballyEnabled) {
      return res.status(400).json({ error: { message: "Registration is temporarily off." } });
    }

    const { name, email, password, gender } = req.body;

    if (!name || !email || !password || !gender) {
      return res.status(400).json({ error: { message: "All fields are required." } });
    }

    // Validate password strength
    // if (password.length < 8) {
    //   return res.status(400).json({ error: { message: "Password must be at least 8 characters long." } });
    // }

    // Validate gender
    const validGenders = ["male", "female", "other"];
    if (!validGenders.includes(gender.toLowerCase())) {
      return res.status(400).json({ error: { message: "Invalid gender value." } });
    }

    // Check for existing name (case-insensitive)
    const existingName = await userModel.findOne({ name: new RegExp(`^${name}$`, "i") });
    if (existingName) {
      return res.status(400).json({
        error: { message: `'${name}' name is already taken. Name must be unique.` },
      });
    }

    // Check for existing email (case-insensitive)
    const normalizedEmail = email.toLowerCase();
    const existingUser = await userModel.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(400).json({ error: { message: "User already exists." } });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const user = new userModel({
      name,
      email: normalizedEmail,
      password: passwordHash,
      gender: gender.toLowerCase(),
      // If no settings exist, make the first user an admin
      isAdmin: !settings,
    });

    await user.save();

    // Create AdminSettings for the first user
    if (!settings) {
      const newSettings = new AdminSettings({
        features: {
          user_registration: true, // Enable registration by default
          // Other defaults as per your schema
        },
        security: {
          require_admin_approval: true, // Or false, depending on your needs
          // Other defaults
        },
        updated_by: user._id, // Reference the first user as the creator
      });
      await newSettings.save();
    }

    // Handle approval based on settings
    if (settings?.security?.require_admin_approval && settings) {
      try {
        await createUserApproval(user._id, req);
        return res.status(201).json({
          message: "User registered successfully. Awaiting approval.",
        });
      } catch (approvalError) {
        return res.status(500).json({
          error: { message: "Failed to create approval request.", details: approvalError.message },
        });
      }
    } else {
      user.isApproved = true;
      await user.save();
      return res.status(201).json({ message: "User registered successfully." });
    }
  } catch (error) {
    return res.status(500).json({
      error: { message: "Internal server error", details: error.message },
    });
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

    // Find user and include password explicitly
    const user = await userModel
      .findOne({ email })
      .select(
        "name email gender image bio role account_status is_active last_seen themeIndex fileSendingAllowed password"
      );

    if (!user) {
      return res
        .status(401)
        .json({ message: "Email or password is incorrect." });
    }

    // Compare password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res
        .status(401)
        .json({ message: "Email or password is incorrect." });
    }

    // Check account status
    if (!user.is_active) {
      return res.status(403).json({ message: "Account is deactivated." });
    }

    // Log login metadata (optional but useful)
    console.log("Login attempt", {
      ip: req.ip,
      userAgent: req.headers["user-agent"],
      user: user._id.toString(),
    });

    // Update last_login (optional: add to your schema)
    await userModel.findByIdAndUpdate(user._id, { last_login: new Date() });

    // Clear old cookies
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "None",
      path: "/",
    };

    res.clearCookie("access_token", cookieOptions);
    res.clearCookie("refresh_token", cookieOptions);

    // Clear old Redis tokens
    await redisClient.del(`access_token_${user._id}`);
    await redisClient.del(`refresh_token_${user._id}`);

    // Generate new tokens
    const accessToken = jwt.sign(
      { id: user._id },
      process.env.ACCESS_TOKEN_SECRET,
      { expiresIn: "1d" }
    );
    const refreshToken = jwt.sign(
      { id: user._id },
      process.env.REFRESH_TOKEN_SECRET,
      { expiresIn: "7d" }
    );

    // Store tokens in Redis + cookies
    await storeToken(
      res,
      { access: accessToken, refresh: refreshToken },
      user._id.toString()
    );

    // Emit online users update (if using Socket.IO)
    if (req.io) {
      req.io.emit(
        "loggedUsersUpdate",
        Array.from(onlineUsers.values()).map((u) => u.userData)
      );
    }

    // Return user info (excluding password)
    const { password: _ignored, ...safeUser } = user.toObject();

    res.status(200).json({
      message: "Login successful",
      user: safeUser,
    });
  } catch (error) {
    console.error("Login error:", error.message);
    res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
};

const logout = async (req, res) => {
  try {
    const { access_token, refresh_token } = await getToken(req);

    // Clear cookies
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

    // Clear tokens from Redis
    if (access_token || refresh_token) {
      await removeToken( res, req );
    }

    res.status(200).json({ message: "Logged out successfully" });
  } catch (error) {
    console.error("Logout error:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
};

const escapeRegex = (string) => {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

export const searchUser = async (req, res) => {
  try {
    const { query, page = 1, limit = 10 } = req.query;

    if (!query) {
      return res.status(400).json({ error: "Query parameter is required" });
    }

    if (!query.match(/^[a-zA-Z0-9._%+-@]*$/)) {
      return res.status(400).json({ error: "Invalid query characters" });
    }

    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);

    if (pageNum < 1 || limitNum < 1) {
      return res
        .status(400)
        .json({ error: "Page and limit must be positive integers" });
    }

    const escapedQuery = escapeRegex(query);
    let searchCriteria;

    if (query.includes("@")) {
      searchCriteria = { email: { $regex: escapedQuery, $options: "i" } };
    } else {
      searchCriteria = { name: { $regex: escapedQuery, $options: "i" } };
    }

    // Count total matching documents
    const total = await User.countDocuments(searchCriteria);

    // Fetch paginated results
    const users = await User.find(searchCriteria)
      .select("name email image")
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .lean();

    if (!users.length) {
      return res.status(404).json({ message: "No users found" });
    }

    res.status(200).json({
      users,
      total,
      page: pageNum,
      totalPages: Math.ceil(total / limitNum),
    });
  } catch (error) {
    console.error("Error searching users:", error);
    res.status(500).json({ error: "Server error" });
  }
};

export const deleteUser = async (req, res) => {
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
  let updateData = req.body;

  console.log("Received Data:", updateData); // Debugging log

  // Fix how image URLs are handled
  if (typeof updateData.image === "string" && updateData.image.trim() !== "") {
    updateData.image = decodeURIComponent(updateData.image);
  }

  // Validate and sanitize input
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    //  Get User Schema Fields Dynamically
    const allowedFields = Object.keys(userModel.schema.paths);
    updateData = Object.keys(updateData).reduce((filteredData, key) => {
      if (allowedFields.includes(key)) {
        filteredData[key] = updateData[key];
      }
      return filteredData;
    }, {});

    console.log("Filtered Update Data:", updateData); // Debugging log

    //  Update Only Allowed Fields
    const updatedUser = await userModel.findByIdAndUpdate(
      userId,
      { $set: updateData },
      { new: true, runValidators: true }
    );

    if (!updatedUser) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json(updatedUser);
  } catch (error) {
    res.status(500).json({
      message: "Error updating user information",
      error: error.message,
    });
  }
};

export const getUserThemeIndex = async (req, res) => {
  try {
    const userId = req.user._id; // assuming you use auth middleware
    const user = await User.findById(userId).select("themeIndex");
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json({ themeIndex: user.themeIndex });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
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

export const updateUserThemeIndex = async (req, res) => {
  try {
    const { themeIndex } = req.body;
    const userId = req.user._id;
    const user = await User.findByIdAndUpdate(
      userId,
      { themeIndex },
      { new: true }
    );
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json({ message: "Theme index updated", themeIndex: user.themeIndex });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};

export {
  register,
  login,
  logout,
  getAllUsers,
  getUserInfo,
  updateUserInfo,
  refreshToken,
};
