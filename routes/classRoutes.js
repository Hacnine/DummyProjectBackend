import express from "express"
import { requireAuth, requireTeacher, requireConversationAdmin } from "../middlewares/roleMiddleware.js"
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
router.put("/:classId", requireConversationAdmin, updateClass)
router.delete("/:classId", requireConversationAdmin, deleteClass)
router.get("/:classId/stats", requireConversationAdmin, getClassStats)
router.get("/:classId/members", getClassMembers)

// Member management routes
router.put("/:classId/add-member", requireConversationAdmin, addMember)
router.delete("/:classId/remove-member", requireConversationAdmin, removeMember)
router.put("/:classId/add-moderator", requireConversationAdmin, addModerator)
router.put("/:classId/remove-moderator", requireConversationAdmin, removeModerator)

// Join request routes
router.get("/:classId/requests/", requireConversationAdmin, getJoinRequests)
router.put("/:classId/approve/:userId", requireConversationAdmin, approveJoinRequest)
router.put("/:classId/reject/:userId", requireConversationAdmin, rejectJoinRequest)

// Settings routes
router.put("/:classId/settings", requireConversationAdmin, updateClassSettings)

export default router
