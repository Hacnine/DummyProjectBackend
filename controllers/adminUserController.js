import User from "../models/userModel.js"
import UserDeletionSchedule from "../models/userDeletionScheduleModel.js"
import AdminActivityLog from "../models/adminActivityLogModel.js"
import bcrypt from "bcrypt"

// Log admin activity helper

export const getAllUsers = async (req, res) => {
  // Implement pagination, search, etc. as needed
  // Example:
  const page = parseInt(req.query.page) || 1
  const limit = parseInt(req.query.limit) || 20
  const skip = (page - 1) * limit

  const users = await User.find({})
    .skip(skip)
    .limit(limit)
    .select("-password") // Don't send passwords

  const total = await User.countDocuments()
  res.json({
    users,
    total,
    totalPages: Math.ceil(total / limit),
    page,
    limit,
  })
}

const logAdminActivity = async (admin, action, targetType, targetId, details, req) => {
  try {
    await AdminActivityLog.create({
      admin: admin._id,
      action,
      target_type: targetType,
      target_id: targetId,
      details,
      // ip_address: req.ip,
      user_agent: req.get("User-Agent"),
      severity: details?.severity || "low",
    })
  } catch (error) {
    console.error("Failed to log admin activity:", error)
  }
}

// Create new user
export const createUser = async (req, res) => {
  try {
    const { name, email, password, gender, role = "user" } = req.body

    // Validation
    if (!name || !email || !password || !gender) {
      return res.status(400).json({ message: "All fields are required" })
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email })
    if (existingUser) {
      return res.status(400).json({ message: "User with this email already exists" })
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10)

    // Create user
    const newUser = new User({
      name,
      email,
      password: hashedPassword,
      gender,
      role,
      is_active: true,
    })

    await newUser.save()

    // Log activity
    await logAdminActivity(req.user, "create_user", "user", newUser._id, { user_email: email, role }, req)

    // Remove password from response
    const userResponse = newUser.toObject()
    delete userResponse.password

    res.status(201).json({ message: "User created successfully", user: userResponse })
  } catch (error) {
    res.status(500).json({ message: "Failed to create user", error: error.message })
  }
}

// Update user info
export const updateUser = async (req, res) => {
  try {
    const { userId } = req.params
    const updates = req.body

    // Don't allow password updates through this endpoint
    if (updates.password) {
      delete updates.password
    }

    // Validate role changes
    if (updates.role && !["user", "admin", "moderator"].includes(updates.role)) {
      return res.status(400).json({ message: "Invalid role specified" })
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $set: updates },
      { new: true, runValidators: true },
    ).select("-password")

    if (!updatedUser) {
      return res.status(404).json({ message: "User not found" })
    }

    // Log activity
    await logAdminActivity(
      req.user,
      "update_user",
      "user",
      userId,
      { updated_fields: Object.keys(updates), user_email: updatedUser.email },
      req,
    )

    res.json({ message: "User updated successfully", user: updatedUser })
  } catch (error) {
    res.status(500).json({ message: "Failed to update user", error: error.message })
  }
}

// Delete user permanently
export const deleteUser = async (req, res) => {
  try {
    const { userId } = req.params
    const { reason } = req.body

    const user = await User.findById(userId)
    if (!user) {
      return res.status(404).json({ message: "User not found" })
    }

    // Prevent deletion of super admins
    if (user.role === "superadmin") {
      return res.status(403).json({ message: "Cannot delete super admin users" })
    }

    // Delete user
    await User.findByIdAndDelete(userId)

    // Remove from deletion schedule if exists
    await UserDeletionSchedule.deleteMany({ user: userId })

    // Log activity
    await logAdminActivity(
      req.user,
      "delete_user",
      "user",
      userId,
      { user_email: user.email, reason, severity: "high" },
      req,
    )

    // Emit user deletion event
    // req.io.emit("userDeleted", { userId, reason })

    res.json({ message: "User deleted successfully" })
  } catch (error) {
    res.status(500).json({ message: "Failed to delete user", error: error.message })
  }
}

// Block user
export const blockUser = async (req, res) => {
  try {
    const { userId } = req.params
    const { reason, duration } = req.body

    const user = await User.findByIdAndUpdate(
      userId,
      {
        is_active: false,
        blocked_at: new Date(),
        block_reason: reason,
        block_duration: duration,
      },
      { new: true },
    ).select("-password")

    if (!user) {
      return res.status(404).json({ message: "User not found" })
    }

    // Log activity
    await logAdminActivity(req.user, "block_user", "user", userId, { reason, duration, user_email: user.email }, req)

    // Notify user
    // req.io.to(userId).emit("accountBlocked", {
    //   message: "Your account has been blocked",
    //   reason,
    //   duration,
    // })

    res.json({ message: "User blocked successfully", user })
  } catch (error) {
    res.status(500).json({ message: "Failed to block user", error: error.message })
  }
}

// Unblock user
export const unblockUser = async (req, res) => {
  try {
    const { userId } = req.params

    const user = await User.findByIdAndUpdate(
      userId,
      {
        is_active: true,
        $unset: { blocked_at: 1, block_reason: 1, block_duration: 1 },
      },
      { new: true },
    ).select("-password")

    if (!user) {
      return res.status(404).json({ message: "User not found" })
    }

    // Log activity
    await logAdminActivity(req.user, "unblock_user", "user", userId, { user_email: user.email }, req)

    // Notify user
    // req.io.to(userId).emit("accountUnblocked", {
    //   message: "Your account has been unblocked",
    // })

    res.json({ message: "User unblocked successfully", user })
  } catch (error) {
    res.status(500).json({ message: "Failed to unblock user", error: error.message })
  }
}

// Get users scheduled for deletion
export const getScheduledDeletions = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query

    const scheduledDeletions = await UserDeletionSchedule.find({
      status: "scheduled",
    })
      .populate("user", "name email last_seen createdAt")
      .sort({ scheduled_for: 1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)

    const total = await UserDeletionSchedule.countDocuments({ status: "scheduled" })

    res.json({
      deletions: scheduledDeletions,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total,
    })
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch scheduled deletions", error: error.message })
  }
}

// Prevent user deletion
export const preventDeletion = async (req, res) => {
  try {
    const { scheduleId } = req.params
    const { reason } = req.body

    const schedule = await UserDeletionSchedule.findById(scheduleId).populate("user")
    if (!schedule) {
      return res.status(404).json({ message: "Deletion schedule not found" })
    }

    // Update schedule status
    schedule.status = "prevented"
    schedule.prevented_by = req.user._id
    schedule.prevented_at = new Date()
    schedule.prevention_reason = reason
    await schedule.save()

    // Log activity
    await logAdminActivity(
      req.user,
      "prevent_deletion",
      "user",
      schedule.user._id,
      { user_email: schedule.user.email, reason },
      req,
    )

    res.json({ message: "User deletion prevented successfully", schedule })
  } catch (error) {
    res.status(500).json({ message: "Failed to prevent deletion", error: error.message })
  }
}

// Cancel deletion prevention (re-schedule for deletion)
export const cancelPreventionAndReschedule = async (req, res) => {
  try {
    const { scheduleId } = req.params

    const schedule = await UserDeletionSchedule.findById(scheduleId).populate("user")
    if (!schedule) {
      return res.status(404).json({ message: "Deletion schedule not found" })
    }

    // Reset schedule status
    schedule.status = "scheduled"
    schedule.prevented_by = null
    schedule.prevented_at = null
    schedule.prevention_reason = null
    await schedule.save()

    // Log activity
    await logAdminActivity(
      req.user,
      "reschedule_deletion",
      "user",
      schedule.user._id,
      { user_email: schedule.user.email },
      req,
    )

    res.json({ message: "User re-scheduled for deletion", schedule })
  } catch (error) {
    res.status(500).json({ message: "Failed to reschedule deletion", error: error.message })
  }
}

// Reset user password
export const resetUserPassword = async (req, res) => {
  try {
    const { userId } = req.params
    const { newPassword } = req.body

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters long" })
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10)

    const user = await User.findByIdAndUpdate(userId, { password: hashedPassword }, { new: true }).select("-password")

    if (!user) {
      return res.status(404).json({ message: "User not found" })
    }

    // Log activity
    await logAdminActivity(
      req.user,
      "reset_password",
      "user",
      userId,
      { user_email: user.email, severity: "medium" },
      req,
    )

    res.json({ message: "Password reset successfully" })
  } catch (error) {
    res.status(500).json({ message: "Failed to reset password", error: error.message })
  }
}

// Get inactive users (for monitoring)
export const getInactiveUsers = async (req, res) => {
  try {
    const { months = 6 } = req.query
    const cutoffDate = new Date()
    cutoffDate.setMonth(cutoffDate.getMonth() - months)

    const inactiveUsers = await User.find({
      $or: [{ last_seen: { $lt: cutoffDate } }, { last_seen: null, createdAt: { $lt: cutoffDate } }],
      is_active: true,
    })
      .select("-password")
      .sort({ last_seen: 1 })

    res.json({ users: inactiveUsers, cutoffDate })
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch inactive users", error: error.message })
  }
}
