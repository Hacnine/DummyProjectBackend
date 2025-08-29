import express from "express"
import { requireAuth, requireAdmin } from "../middlewares/roleMiddleware.js"
import {
  startAlertnessSession,
  respondToAlertnessSession,
  getAlertnessSessions,
  getActiveSession,
  endAlertnessSession,
  getSessionStats,
  deleteAlertnessSession,
} from "../controllers/alertnessController.js"

const router = express.Router()

// All routes require authentication
router.use(requireAuth)

// Session management routes
router.post("/class/:classId/start", requireAdmin, startAlertnessSession);
router.post("/class/:classId/respond", respondToAlertnessSession)
router.post("/class/:classId/end", requireAdmin, endAlertnessSession)

// Get session data
router.get("/class/:classId/sessions", getAlertnessSessions)
router.get("/class/:classId/active", getActiveSession)
router.get("/session/:sessionId/stats", getSessionStats)

// Delete session
router.delete("/session/:sessionId", requireAdmin, deleteAlertnessSession)

export default router
