import express from "express";
import { isLogin } from "../middlewares/auth.middleware.js";
import {
  sendMessage,
  editMessage,
  deleteMessage,
  replyMessage,
  getMessages,
  markMessagesAsRead,
} from "../controllers/messageController.js";
import upload from "../middlewares/multerConfig.js";

const router = express.Router();

// Routes for messaging
router.post("/send", isLogin, upload.any(), sendMessage); // Send message for new conversation
router.post("/send/:conversationId", isLogin, upload.any(), sendMessage); // Send message to existing conversation
router.put("/edit-message/:messageId", isLogin, editMessage); // Edit a text message
router.delete("/delete/:messageId", isLogin, deleteMessage); // Soft-delete a message
router.post(":conversationId/reply/:messageId", isLogin, replyMessage); // Reply to a message
router.get("/:conversationId", isLogin, getMessages); // Get messages with pagination
router.put("/:conversationId/read", isLogin, markMessagesAsRead); // Mark messages as read

export default router;