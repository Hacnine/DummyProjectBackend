import express from "express";
import { requireAuth, requireConversationAdmin } from "../middlewares/roleMiddleware.js";
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
  getLastSession,
  getAttendanceOverview,
} from "../controllers/attendanceController.js";

const router = express.Router();

// All routes require authentication
router.use(requireAuth);
router.get("/class/:classId", getClassAttendance);
// Session routes
router.post("/sessions/manual/:classId", requireConversationAdmin, createManualSession);
router.post("/sessions/auto-generate", autoGenerateSessions);
router.get("/sessions", getSessions);
router.get("/last-session", getLastSession);

// Attendance routes
router.post("/mark", markAttendance);
router.put("/edit/:recordId", requireConversationAdmin, editAttendance);
router.post("/bulk/:classId", requireConversationAdmin, bulkUpdateAttendance);
router.get("/session/:sessionId", getSessionAttendance);
router.get("/student/:studentId", getStudentAttendance);
router.get("/analytics/class/:classId", getAttendanceAnalytics);
router.get("/class/:classId", getClassAttendance);
router.get("/analytics/global",  getGlobalAttendanceAnalytics);
router.get("/:classId/attendance-overview", getAttendanceOverview);

export default router;