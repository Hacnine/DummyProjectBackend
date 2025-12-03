import express from "express";
import {
  reportConversation,
  getReports,
  updateReportStatus,
  getReportStats,
} from "../controllers/reportController.js";
import { isLogin } from "../middlewares/auth.middleware.js";
import { requireAdmin } from "../middlewares/adminAuth.js";

const router = express.Router();

// User routes (requires login)
router.use(isLogin);

// Submit a report for a conversation
router.post("/conversation/:conversationId", reportConversation);

// Admin routes
router.get("/", requireAdmin, getReports);
router.get("/stats", requireAdmin, getReportStats);
router.patch("/:reportId", requireAdmin, updateReportStatus);

export default router;
