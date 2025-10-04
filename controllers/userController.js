import userModel from "../models/userModel.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { storeToken, getToken, removeToken } from "../utils/redisTokenStore.js";
import { fileURLToPath } from "url";
import path from "path";
import User from "../models/userModel.js";
import { onlineUsers } from "../sockets/onlineUserSocket.js";
import { createUserApproval } from "../utils/userApprovalMiddleware.js";
import AdminSettings from "../models/adminSettingsModel.js";
import asyncHandler from "express-async-handler";
import { param, validationResult } from "express-validator";
import { Block } from "../models/blockModel.js";
import Conversation from "../models/conversationModel.js";
import { getRedisClient } from "../config/redisClient.js";

const register = async (req, res) => {
  try {
    const settings = await AdminSettings.findOne();
    // Allow registration if settings don't exist (initial setup) or if user_registration is true
    const isRegistrationGloballyEnabled =
      !settings || settings.features?.user_registration !== false;

    if (!isRegistrationGloballyEnabled) {
      return res
        .status(400)
        .json({ error: { message: "Registration is temporarily off." } });
    }

    const { name, email, password, gender } = req.body;

    if (!name || !email || !password || !gender) {
      return res
        .status(400)
        .json({ error: { message: "All fields are required." } });
    }

    // Validate password strength
    // if (password.length < 8) {
    //   return res.status(400).json({ error: { message: "Password must be at least 8 characters long." } });
    // }

    // Validate gender
    const validGenders = ["male", "female", "other"];
    if (!validGenders.includes(gender.toLowerCase())) {
      return res
        .status(400)
        .json({ error: { message: "Invalid gender value." } });
    }

    // Check for existing name (case-insensitive)
    const normalizedName = name.trim().toLowerCase();
    const existingName = await userModel.findOne({
      name: new RegExp(`^${normalizedName}$`, "i"),
    });
    if (existingName) {
      return res.status(400).json({
        error: {
          message: `'${name}' name is already taken. Choose a different name.`,
        },
      });
    }

    // Check for existing email (case-insensitive)
    const normalizedEmail = email.toLowerCase();
    const existingUser = await userModel.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(400).json({
        error: {
          message: `'${email}' name is already taken. Choose a different email address.`,
        },
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const user = new userModel({
      name: normalizedName,
      email: normalizedEmail,
      password: passwordHash,
      gender: gender.toLowerCase(),
      image: `${
        gender.toLowerCase() === "male"
          ? "/images/avatar/default-avatar.svg"
          : "/images/avatar/womanav1.svg"
      }`,
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
          error: {
            message: "Failed to create approval request.",
            details: approvalError.message,
          },
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

    // Normalize email to lowercase
    const normalizedEmail = email.toLowerCase();

    // Find user and include password explicitly
    const user = await userModel
      .findOne({ email: normalizedEmail })
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
    await userModel.findByIdAndUpdate(user._id, { last_seen: new Date() });

    // Clear old cookies
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "none",
      path: "/",
    };

    res.clearCookie("access_token", cookieOptions);
    res.clearCookie("refresh_token", cookieOptions);

    // Clear old Redis tokens
    const redis = getRedisClient();
    await redis.del(`access_token_${user._id}`);
    await redis.del(`refresh_token_${user._id}`);

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
      access: accessToken,
      refresh: refreshToken,
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
      sameSite: "none",
    });
    res.clearCookie("refresh_token", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "none",
    });

    // Clear tokens from Redis
    if (access_token || refresh_token) {
      await removeToken(res, req);
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
      .select("name image")
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

export const getUserInfo = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { userId } = req.params;

  // Ensure the userId is valid
  if (!userId.match(/^[0-9a-fA-F]{24}$/)) {
    return res.status(400).json({ message: "Invalid user ID" });
  }

  // Fetch user with specific fields only
  const user = await User.findById(userId).select(
    "name email bio image role is_active last_seen"
  );

  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }

  res.status(200).json({
    name: user.name,
    email: user.email,
    bio: user.bio || "",
    image: user.image || "",
    role: user.role,
    is_active: user.is_active,
    last_seen: user.last_seen,
  });
});

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

// Update user name
export const updateName = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { name } = req.body;
  const userId = req.user._id; // Assuming user ID is available from authentication middleware

  // Check if name already exists
  const existingUser = await User.findOne({ name, _id: { $ne: userId } });
  if (existingUser) {
    return res.status(400).json({ message: "Name already taken" });
  }

  const user = await User.findByIdAndUpdate(
    userId,
    { name, updatedAt: Date.now() },
    { new: true, select: "name email" }
  );

  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }

  res.status(200).json({
    message: "Name updated successfully",
    user: { name: user.name, email: user.email },
  });
});

// Update user email
export const updateEmail = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { email } = req.body;
  const userId = req.user._id;

  // Check if email already exists
  const existingUser = await User.findOne({ email, _id: { $ne: userId } });
  if (existingUser) {
    return res.status(400).json({ message: "Email already taken" });
  }

  const user = await User.findByIdAndUpdate(
    userId,
    { email, updatedAt: Date.now() },
    { new: true, select: "name email" }
  );

  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }

  res.status(200).json({
    message: "Email updated successfully",
    user: { name: user.name, email: user.email },
  });
});

// Update user password
export const updatePassword = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { password } = req.body;
  const userId = req.user._id;
  const passwordHash = await bcrypt.hash(password, 10);
  const user = await User.findByIdAndUpdate(
    userId,
    { password: passwordHash, updatedAt: Date.now() },
    { new: true, select: "name email" }
  );

  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }

  res.status(200).json({
    message: "Password updated successfully",
    user: { name: user.name, email: user.email },
  });
});

//  Helper: Add user to conversation blockList
const addToConversationBlockList = async (
  conversationId,
  blockerId,
  blockedId
) => {
  const conversation = await Conversation.findById(conversationId);
  if (!conversation) throw new Error("Conversation not found");

  const alreadyBlocked = conversation.blockList.some(
    (entry) =>
      entry.blockedBy.toString() === blockerId.toString() &&
      entry.blockedUser.toString() === blockedId.toString()
  );

  if (!alreadyBlocked) {
    conversation.blockList.push({
      blockedBy: blockerId,
      blockedUser: blockedId,
    });
    await conversation.save();
  }

  return conversation;
};
// Helper: Remove user from conversation blockList
const removeFromConversationBlockList = async (
  conversationId,
  blockerId,
  blockedId
) => {
  const conversation = await Conversation.findById(conversationId);
  if (!conversation) throw new Error("Conversation not found");

  conversation.blockList = conversation.blockList.filter(
    (entry) =>
      !(
        entry.blockedBy.toString() === blockerId.toString() &&
        entry.blockedUser.toString() === blockedId.toString()
      )
  );

  await conversation.save();
  return conversation;
};

// Block a user
export const blockUser = async (req, res) => {
  try {
    const blockerId = req.user._id;
    const { blockedId, conversationId } = req.body;

    if (blockerId.toString() === blockedId) {
      return res.status(400).json({ message: "You cannot block yourself." });
    }

    // ---- Global Block ----
    const existingGlobal = await Block.findOne({
      blocker: blockerId,
      blocked: blockedId,
    });
    if (existingGlobal) {
      return res
        .status(400)
        .json({ message: "User already globally blocked." });
    }

    const globalBlock = await Block.create({
      blocker: blockerId,
      blocked: blockedId,
    });

    // ---- Conversation-level Block (optional) ----
    let updatedConversation = null;
    if (conversationId) {
      updatedConversation = await addToConversationBlockList(
        conversationId,
        blockerId,
        blockedId
      );
    }

    res.status(201).json({
      message: "User blocked successfully.",
      globalBlock,
      conversation: updatedConversation,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Unblock a user
export const unblockUser = async (req, res) => {
  try {
    const blockerId = req.user._id;
    const { userId } = req.params; // blocked user
    const { conversationId } = req.body; // optional

    // ---- Global Unblock ----
    const deletedGlobal = await Block.findOneAndDelete({
      blocker: blockerId,
      blocked: userId,
    });

    // ---- Conversation-level Unblock ----
    let updatedConversation = null;
    if (conversationId) {
      updatedConversation = await removeFromConversationBlockList(
        conversationId,
        blockerId,
        userId
      );
    }

    if (!deletedGlobal && !updatedConversation) {
      return res.status(404).json({ message: "User not blocked." });
    }

    res.json({
      message: "User unblocked successfully.",
      deletedGlobal,
      conversation: updatedConversation,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export { register, login, logout, getAllUsers, updateUserInfo, refreshToken };
