import express from "express"
import { requireAuth } from "../middlewares/roleMiddleware.js"
import {
  getUserNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  deleteNotification,
  getUnreadNotificationCount,
  updateNotificationSettings,
  getNotificationSettings,
} from "../controllers/notificationController.js"

const router = express.Router()

// All routes require authentication
router.use(requireAuth)

// Notification routes
router.get("/", getUserNotifications)
router.get("/unread/count", getUnreadNotificationCount)
router.put("/:id/read", markNotificationAsRead)
router.put("/read-all", markAllNotificationsAsRead)
router.delete("/:id", deleteNotification)

// Notification settings
router.get("/settings", getNotificationSettings)
router.put("/settings", updateNotificationSettings)

export default router
