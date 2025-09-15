import jwt from "jsonwebtoken"
import bcrypt from "bcryptjs"
import crypto from "crypto"
import User from "../models/userModel.js"
import { sendEmail } from "../utils/emailService.js"

// Generate JWT tokens
const generateTokens = (id) => {
  const accessToken = jwt.sign({ id }, process.env.ACCESS_TOKEN_SECRET, {
    expiresIn: "15m",
  })

  const refreshToken = jwt.sign({ id }, process.env.REFRESH_TOKEN_SECRET, {
    expiresIn: "7d",
  })

  return { accessToken, refreshToken }
}

// Register user
export const register = async (req, res) => {
  try {
    const { name, email, password, role = "student" } = req.body

    // Check if user already exists
    const existingUser = await User.findOne({ email })
    if (existingUser) {
      return res.status(400).json({ message: "User already exists with this email" })
    }

    // Hash password
    const salt = await bcrypt.genSalt(10)
    const hashedPassword = await bcrypt.hash(password, salt)

    // Generate email verification token
    const emailVerificationToken = crypto.randomBytes(32).toString("hex")

    // Create user
    const user = new User({
      name,
      email,
      password: hashedPassword,
      role,
      emailVerificationToken,
      isEmailVerified: false,
    })

    await user.save()

    // Send verification email
    const verificationUrl = `${process.env.CLIENT_URL}/verify-email?token=${emailVerificationToken}`
    await sendEmail({
      to: email,
      subject: "Verify Your Email",
      html: `
        <h1>Email Verification</h1>
        <p>Please click the link below to verify your email:</p>
        <a href="${verificationUrl}">Verify Email</a>
      `,
    })

    res.status(201).json({
      message: "User registered successfully. Please check your email for verification.",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    })
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

// Login user
export const login = async (req, res) => {
  try {
    const { email, password } = req.body

    // Check if user exists
    const user = await User.findOne({ email })
    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" })
    }

    // Check password
    const isPasswordValid = await bcrypt.compare(password, user.password)
    if (!isPasswordValid) {
      return res.status(401).json({ message: "Invalid credentials" })
    }

    // Check if email is verified
    if (!user.isEmailVerified) {
      return res.status(401).json({ message: "Please verify your email before logging in" })
    }

    // Generate tokens
    const { accessToken, refreshToken } = generateTokens(user._id)

    // Save refresh token to user
    user.refreshToken = refreshToken
    await user.save()

    // Set refresh token as httpOnly cookie
    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "none",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    })

    res.json({
      message: "Login successful",
      accessToken,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        image: user.image,
      },
    })
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

// Logout user
export const logout = async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
    if (user) {
      user.refreshToken = null
      await user.save()
    }

    res.clearCookie("refreshToken")
    res.json({ message: "Logout successful" })
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

// Refresh token
export const refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.cookies

    if (!refreshToken) {
      return res.status(401).json({ message: "Refresh token not provided" })
    }

    // Verify refresh token
    const decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET)
    const user = await User.findById(decoded.id)

    if (!user || user.refreshToken !== refreshToken) {
      return res.status(401).json({ message: "Invalid refresh token" })
    }

    // Generate new tokens
    const { accessToken, refreshToken: newRefreshToken } = generateTokens(user._id)

    // Update refresh token
    user.refreshToken = newRefreshToken
    await user.save()

    // Set new refresh token cookie
    res.cookie("refreshToken", newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "none",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    })

    res.json({ accessToken })
  } catch (error) {
    res.status(401).json({ message: "Invalid refresh token" })
  }
}

// Verify email
export const verifyEmail = async (req, res) => {
  try {
    const { token } = req.body

    const user = await User.findOne({ emailVerificationToken: token })
    if (!user) {
      return res.status(400).json({ message: "Invalid verification token" })
    }

    user.isEmailVerified = true
    user.emailVerificationToken = null
    await user.save()

    res.json({ message: "Email verified successfully" })
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

// Resend verification email
export const resendVerification = async (req, res) => {
  try {
    const { email } = req.body

    const user = await User.findOne({ email })
    if (!user) {
      return res.status(404).json({ message: "User not found" })
    }

    if (user.isEmailVerified) {
      return res.status(400).json({ message: "Email already verified" })
    }

    // Generate new verification token
    const emailVerificationToken = crypto.randomBytes(32).toString("hex")
    user.emailVerificationToken = emailVerificationToken
    await user.save()

    // Send verification email
    const verificationUrl = `${process.env.CLIENT_URL}/verify-email?token=${emailVerificationToken}`
    await sendEmail({
      to: email,
      subject: "Verify Your Email",
      html: `
        <h1>Email Verification</h1>
        <p>Please click the link below to verify your email:</p>
        <a href="${verificationUrl}">Verify Email</a>
      `,
    })

    res.json({ message: "Verification email sent" })
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

// Forgot password
export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body

    const user = await User.findOne({ email })
    if (!user) {
      return res.status(404).json({ message: "User not found" })
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString("hex")
    user.passwordResetToken = resetToken
    user.passwordResetExpires = Date.now() + 10 * 60 * 1000 // 10 minutes
    await user.save()

    // Send reset email
    const resetUrl = `${process.env.CLIENT_URL}/reset-password?token=${resetToken}`
    await sendEmail({
      to: email,
      subject: "Password Reset",
      html: `
        <h1>Password Reset</h1>
        <p>Please click the link below to reset your password:</p>
        <a href="${resetUrl}">Reset Password</a>
        <p>This link will expire in 10 minutes.</p>
      `,
    })

    res.json({ message: "Password reset email sent" })
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

// Reset password
export const resetPassword = async (req, res) => {
  try {
    const { token, password } = req.body

    const user = await User.findOne({
      passwordResetToken: token,
      passwordResetExpires: { $gt: Date.now() },
    })

    if (!user) {
      return res.status(400).json({ message: "Invalid or expired reset token" })
    }

    // Hash new password
    const salt = await bcrypt.genSalt(10)
    const hashedPassword = await bcrypt.hash(password, salt)

    // Update user
    user.password = hashedPassword
    user.passwordResetToken = null
    user.passwordResetExpires = null
    user.refreshToken = null // Invalidate all sessions
    await user.save()

    res.json({ message: "Password reset successful" })
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message })
  }
}
