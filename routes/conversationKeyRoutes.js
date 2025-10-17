import express from "express";
import { isLogin } from "../middlewares/auth.middleware.js";
import {
  exchangeConversationKey,
  getParticipantKey,
  getConversationKeys,
  rotateConversationKey
} from "../controllers/conversationKeyController.js";

const router = express.Router();

// Exchange public key for a specific conversation
router.post("/:conversationId/key-exchange", isLogin, exchangeConversationKey);

// Get all participants' keys for a conversation
router.get("/:conversationId/keys", isLogin, getConversationKeys);

// Get specific participant's key for a conversation
router.get("/:conversationId/keys/:userId", isLogin, getParticipantKey);

// Rotate user's key for a specific conversation
router.put("/:conversationId/key-rotate", isLogin, rotateConversationKey);

export default router;