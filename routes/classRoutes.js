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
  getUserClasses, // Declared here
} from "../controllers/classController.js"

const router = express.Router()

// All routes require authentication
router.use(requireAuth)

// Public class routes (for authenticated users)
router.post("/create", requireTeacher, createClass)
router.get("/list", getUserClasses)
router.post("/:id/request-join", requestJoinClass)
router.post("/:id/leave", leaveClass)

// Class-specific routes
router.get("/:id", getClassDetails)
router.put("/:id", requireClassAdmin, updateClass)
router.delete("/:id", requireClassAdmin, deleteClass)
router.get("/:id/stats", requireClassAdmin, getClassStats)
router.get("/:id/members", getClassMembers)

// Member management routes
router.put("/:id/add-member", requireClassAdmin, addMember)
router.delete("/:id/remove-member", requireClassAdmin, removeMember)
router.put("/:id/add-moderator", requireClassAdmin, addModerator)
router.put("/:id/remove-moderator", requireClassAdmin, removeModerator)

// Join request routes
router.get("/:classId/requests/", requireClassAdmin, getJoinRequests)
router.put("/:classId/approve/:userId", requireClassAdmin, approveJoinRequest)
router.put("/:classId/reject/:userId", requireClassAdmin, rejectJoinRequest)

// Settings routes
router.put("/:id/settings", requireClassAdmin, updateClassSettings)

export default router
