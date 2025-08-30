import express from "express"
import { requireAuth, requireConversationAdmin } from "../middlewares/roleMiddleware.js"
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
router.post("/class/:classId/start", requireConversationAdmin, startAlertnessSession);
router.post("/class/:classId/respond", respondToAlertnessSession)
router.post("/class/:classId/end", requireConversationAdmin, endAlertnessSession)

// Get session data
router.get("/class/:classId/sessions", getAlertnessSessions)
router.get("/class/:classId/active", getActiveSession)
router.get("/session/:sessionId/stats", getSessionStats)

// Delete session
router.delete("/session/:sessionId", requireConversationAdmin, deleteAlertnessSession)

export default router
