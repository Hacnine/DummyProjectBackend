import express from "express"
import {
  getDashboardStats,
  getAllUsersForAdmin,
  getPendingApprovals,
  approveUser,
  rejectUser,
  getAdminSettings,
  updateAdminSettings,
  suspendUser,
  unsuspendUser,
  getActivityLogs,
  getSystemHealth,
} from "../controllers/adminController.js"
import { requireAdmin, requireSuperAdmin } from "../middlewares/adminAuth.js"

const router = express.Router()

// Dashboard
router.get("/dashboard/stats", requireAdmin, getDashboardStats)
router.get("/system/health", requireAdmin, getSystemHealth)

// User Management
router.get("/users", requireAdmin, getAllUsersForAdmin)
router.post("/users/:userId/suspend", requireAdmin, suspendUser)
router.post("/users/:userId/unsuspend", requireAdmin, unsuspendUser)

// User Approvals
router.get("/approvals/pending", requireAdmin, getPendingApprovals)
router.post("/approvals/:approvalId/approve", requireAdmin, approveUser)
router.post("/approvals/:approvalId/reject", requireAdmin, rejectUser)

// Settings
router.get("/settings", requireAdmin, getAdminSettings)
router.put("/settings", requireSuperAdmin, updateAdminSettings)

// Activity Logs
router.get("/logs", requireAdmin, getActivityLogs)

export default router
