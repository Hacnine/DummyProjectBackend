import express from "express"
import { requireAuth } from "../middlewares/roleMiddleware.js"
import {
  register,
  login,
  logout,
  refreshToken,
  forgotPassword,
  resetPassword,
  verifyEmail,
  resendVerification,
} from "../controllers/authController.js"

const router = express.Router()

// Public routes
router.post("/register", register)
router.post("/login", login)
router.post("/refresh-token", refreshToken)
router.post("/forgot-password", forgotPassword)
router.post("/reset-password", resetPassword)
router.post("/verify-email", verifyEmail)
router.post("/resend-verification", resendVerification)

// Protected routes
router.post("/logout", requireAuth, logout)
router.get("/me", requireAuth, (req, res) => {
  res.json({ user: req.user })
})

export default router
