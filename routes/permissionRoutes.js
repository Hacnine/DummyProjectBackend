import express from "express";
import { isLogin } from "../middlewares/auth.middleware.js";
import {
  getMessagePermissions,
  requestPermission,
  getPermissionRequests,
  reviewPermissionRequest,
  updateMessagePermissions,
} from "../controllers/permissionController.js";

const router = express.Router();

// Get message permissions for a conversation
router.get("/conversations/:conversationId", isLogin, getMessagePermissions);

// Request a permission change
router.post("/conversations/:conversationId/request", isLogin, requestPermission);

// Get all permission requests for a conversation (admin only)
router.get("/conversations/:conversationId/requests", isLogin, getPermissionRequests);

// Review a permission request (admin only)
router.patch("/requests/:requestId/review", isLogin, reviewPermissionRequest);

// Update message permissions (admin only)
router.patch("/conversations/:conversationId", isLogin, updateMessagePermissions);

export default router;
