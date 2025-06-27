import express from "express"
import authRoutes from "./authRoutes.js"
import userRoutes from "./userRoutes.js"
import classRoutes from "./classRoutes.js"
import assignmentRoutes from "./assignmentRoutes.js"
import attendanceRoutes from "./attendanceRoutes.js"
import alertnessRoutes from "./alertnessRoutes.js"
import messageRoutes from "./messageRoutes.js"
import conversationRoutes from "./conversationRoutes.js"
import fileRoutes from "./fileRoutes.js"
import notificationRoutes from "./notificationRoutes.js"
import adminRoutes from "./adminRoutes.js"

const router = express.Router()

// API version prefix
const API_VERSION = "/api/v1"

// Mount all routes
router.use(`${API_VERSION}/auth`, authRoutes)
router.use(`${API_VERSION}/users`, userRoutes)
router.use(`${API_VERSION}/classes`, classRoutes)
router.use(`${API_VERSION}/assignments`, assignmentRoutes)
router.use(`${API_VERSION}/attendance`, attendanceRoutes)
router.use(`${API_VERSION}/alertness`, alertnessRoutes)
router.use(`${API_VERSION}/messages`, messageRoutes)
router.use(`${API_VERSION}/conversations`, conversationRoutes)
router.use(`${API_VERSION}/files`, fileRoutes)
router.use(`${API_VERSION}/notifications`, notificationRoutes)
router.use(`${API_VERSION}/admin`, adminRoutes)

// Health check route
router.get("/health", (req, res) => {
  res.status(200).json({
    status: "OK",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || "development",
  })
})

// API documentation route
router.get("/", (req, res) => {
  res.json({
    message: "Class Management System API",
    version: "1.0.0",
    endpoints: {
      auth: `${API_VERSION}/auth`,
      users: `${API_VERSION}/users`,
      classes: `${API_VERSION}/classes`,
      assignments: `${API_VERSION}/assignments`,
      attendance: `${API_VERSION}/attendance`,
      alertness: `${API_VERSION}/alertness`,
      messages: `${API_VERSION}/messages`,
      conversations: `${API_VERSION}/conversations`,
      files: `${API_VERSION}/files`,
      notifications: `${API_VERSION}/notifications`,
      admin: `${API_VERSION}/admin`,
    },
  })
})

export default router
