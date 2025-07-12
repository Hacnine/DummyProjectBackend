import express from "express"
import { requireAuth, requireTeacher, requireClassAdmin } from "../middlewares/roleMiddleware.js"
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
router.get("/list",isLogin, getUserClasses)
router.post("/:classId/request-join", requestJoinClass)
router.post("/:classId/leave", leaveClass)

// Class-specific routes
router.get("/:classId", getClassDetails)
router.put("/:classId", requireClassAdmin, updateClass)
router.delete("/:classId", requireClassAdmin, deleteClass)
router.get("/:classId/stats", requireClassAdmin, getClassStats)
router.get("/:classId/members", getClassMembers)

// Member management routes
router.put("/:classId/add-member", requireClassAdmin, addMember)
router.delete("/:classId/remove-member", requireClassAdmin, removeMember)
router.put("/:classId/add-moderator", requireClassAdmin, addModerator)
router.put("/:classId/remove-moderator", requireClassAdmin, removeModerator)

// Join request routes
router.get("/:classId/requests/", requireClassAdmin, getJoinRequests)
router.put("/:classId/approve/:userId", requireClassAdmin, approveJoinRequest)
router.put("/:classId/reject/:userId", requireClassAdmin, rejectJoinRequest)

// Settings routes
router.put("/:classId/settings", requireClassAdmin, updateClassSettings)

export default router
