import express from "express"
import { requireAuth, requireClassAdmin } from "../middlewares/roleMiddleware.js"
import {
  markAttendance,
  getClassAttendance,
  getUserAttendance,
  updateAttendanceRecord,
  deleteAttendanceRecord,
  getAttendanceStats,
  exportAttendance,
  getAttendanceReport,
} from "../controllers/attendanceController.js"

const router = express.Router()

// All routes require authentication
router.use(requireAuth)

// Mark attendance
router.post("/class/:classId/mark", markAttendance)

// Get attendance data
router.get("/class/:classId", getClassAttendance)
router.get("/user/:userId/class/:classId", getUserAttendance)
router.get("/class/:classId/stats", getAttendanceStats)
router.get("/class/:classId/report", requireClassAdmin, getAttendanceReport)

// Manage attendance records
router.put("/:recordId", requireClassAdmin, updateAttendanceRecord)
router.delete("/:recordId", requireClassAdmin, deleteAttendanceRecord)

// Export attendance
router.get("/class/:classId/export", requireClassAdmin, exportAttendance)

export default router
