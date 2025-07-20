import express from "express";
import {
  createUser,
  updateUser,
  deleteUser,
  blockUser,
  unblockUser,
  getScheduledDeletions,
  preventDeletion,
  cancelPreventionAndReschedule,
  resetUserPassword,
  getInactiveUsers,
  getAllUsers,
} from "../controllers/adminUserController.js";
import { requireAdmin, requireSuperAdmin } from "../middlewares/adminAuth.js";
import { isLogin } from "../middlewares/auth.middleware.js";

const router = express.Router();
router.use(isLogin);
// Get all users
router.get("/users", requireAdmin, getAllUsers);

// User CRUD operations
router.post("/create", requireAdmin, createUser);
router.put("/:userId", requireAdmin, updateUser);
router.delete("/:userId", requireSuperAdmin, deleteUser);

// User status management
router.post("/:userId/block", requireAdmin, blockUser);
router.post("/:userId/unblock", requireAdmin, unblockUser);
router.post("/:userId/reset-password", requireAdmin, resetUserPassword);

// Deletion management
router.get("/scheduled-deletions", requireAdmin, getScheduledDeletions);
router.post(
  "/scheduled-deletions/:scheduleId/prevent",
  requireAdmin,
  preventDeletion
);
router.post(
  "/scheduled-deletions/:scheduleId/reschedule",
  requireAdmin,
  cancelPreventionAndReschedule
);

// Monitoring
router.get("/inactive", requireAdmin, getInactiveUsers);

export default router;
