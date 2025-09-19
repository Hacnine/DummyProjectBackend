import jwt from "jsonwebtoken";
import User from "../models/userModel.js";
import Conversation from "../models/conversationModel.js";

// Require Teacher (or higher)
export const requireTeacher = async (req, res, next) => {
  try {
    const authHeader = req.headers["authorization"];
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Access token required" });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);

    const user = await User.findById(decoded.id);
    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }

    if (!["teacher", "admin", "superadmin"].includes(user.role)) {
      return res
        .status(403)
        .json({ message: "Access denied. Teacher role required." });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid token" });
  }
};

// Require Auth (any logged-in user)
export const requireAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers["authorization"];
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Access token required" });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);

    const user = await User.findById(decoded.id);
    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid token" });
  }
};

// Require Conversation Admin
export const requireConversationAdmin = async (req, res, next) => {
  try {
    const { classId } = req.params;
    const userId = req.user._id.toString();

    const classGroup = await Conversation.findById(classId);
    if (!classGroup || !classGroup.group.is_group) {
      return res.status(404).json({ message: "Conversation not found." });
    }

    const isAdmin = classGroup.group.admins.some(
      (admin) => admin.toString() === userId
    );

    if (!isAdmin) {
      return res
        .status(403)
        .json({ message: "Access denied. Class admin privileges required." });
    }

    req.classGroup = classGroup;
    next();
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Server error", error: error.message });
  }
};
