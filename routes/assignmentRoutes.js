import express from "express"
import { requireAuth, requireClassAdmin } from "../middlewares/roleMiddleware.js"
import {
  createAssignment,
  getClassAssignments,
  getAssignmentById,
  updateAssignment,
  deleteAssignment,
  submitAssignment,
  getSubmissions,
  markAssignment,
  getUserAssignments,
  downloadSubmission,
  getAssignmentStats,
} from "../controllers/assignmentController.js"

const router = express.Router()

// All routes require authentication
router.use(requireAuth)

// Assignment CRUD routes
router.post("/create", requireClassAdmin, createAssignment)
router.get("/class/:classId", getClassAssignments)
router.get("/my-assignments", getUserAssignments)
router.get("/:id", getAssignmentById)
router.put("/:id",  updateAssignment)
router.delete("/:id", deleteAssignment)

// Assignment submission routes
router.post("/class/:classId/submit", submitAssignment)
router.get("/:classId/submissions", requireClassAdmin, getSubmissions)
router.put("/:classId/mark/:submissionId", requireClassAdmin, markAssignment)
router.get("/submission/:submissionId/download", downloadSubmission)

// Statistics routes
router.get("/:classId/stats", requireClassAdmin, getAssignmentStats)

export default router
