import express from "express"
import { requireAuth, requireTeacher, requireAdmin } from "../middlewares/roleMiddleware.js"
import {
  createClass,
  getClassDetails,
  updateClass,
  deleteClass,
  addModerator,
  removeModerator,
  addMember,
  removeMember,
  requestJoinClass,
  getJoinRequests,
  approveJoinRequest,
  rejectJoinRequest,
  updateClassSettings,
  getClassStats,
  getClassMembers,
  leaveClass,
  getUserClasses,
  searchClasses, 
} from "../controllers/classController.js"
import { isLogin } from "../middlewares/auth.middleware.js"

const router = express.Router()

// All routes require authentication
router.use(requireAuth)

// Public class routes (for authenticated users)
router.post("/create", requireTeacher, createClass)
router.get("/search-classes",searchClasses)
router.get("/list", getUserClasses)
router.post("/:classId/request-join", requestJoinClass)
router.post("/:classId/leave", leaveClass)

// Class-specific routes
router.get("/:classId", getClassDetails)
router.put("/:classId", requireAdmin, updateClass)
router.delete("/:classId", requireAdmin, deleteClass)
router.get("/:classId/stats", requireAdmin, getClassStats)
router.get("/:classId/members", getClassMembers)

// Member management routes
router.put("/:classId/add-member", requireAdmin, addMember)
router.delete("/:classId/remove-member", requireAdmin, removeMember)
router.put("/:classId/add-moderator", requireAdmin, addModerator)
router.put("/:classId/remove-moderator", requireAdmin, removeModerator)

// Join request routes
router.get("/:classId/requests/", requireAdmin, getJoinRequests)
router.put("/:classId/approve/:userId", requireAdmin, approveJoinRequest)
router.put("/:classId/reject/:userId", requireAdmin, rejectJoinRequest)

// Settings routes
router.put("/:classId/settings", requireAdmin, updateClassSettings)

export default router
