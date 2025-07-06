import express from "express";
import { requireAuth, requireClassAdmin } from "../middlewares/roleMiddleware.js";
import {
  createManualSession,
  getSessions,
  autoGenerateSessions,
  markAttendance,
  editAttendance,
  bulkUpdateAttendance,
  getSessionAttendance,
  getStudentAttendance,
  getAttendanceAnalytics,
  getGlobalAttendanceAnalytics,
  getClassAttendance,
} from "../controllers/attendanceController.js";

const router = express.Router();

// All routes require authentication
router.use(requireAuth);
router.get("/class/:classId", getClassAttendance);
// Session routes
router.post("/sessions/manual/:classId", requireClassAdmin, createManualSession);
router.post("/sessions/auto-generate", autoGenerateSessions);
router.get("/sessions", getSessions);

// Attendance routes
router.post("/mark", markAttendance);
router.put("/edit/:recordId", requireClassAdmin, editAttendance);
router.post("/bulk/:classId", requireClassAdmin, bulkUpdateAttendance);
router.get("/session/:sessionId", getSessionAttendance);
router.get("/student/:studentId", getStudentAttendance);
router.get("/analytics/class/:classId", getAttendanceAnalytics);
router.get("/class/:classId", getClassAttendance);
router.get("/analytics/global",  getGlobalAttendanceAnalytics);

export default router;