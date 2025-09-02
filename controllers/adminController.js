import User from "../models/userModel.js"
import UserApproval from "../models/userApprovalModel.js"
import AdminSettings from "../models/adminSettingsModel.js"
import AdminActivityLog from "../models/adminActivityLogModel.js"
import Conversation from "../models/conversationModel.js"
import Message from "../models/messageModel.js"

// Log admin activity
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

// Dashboard Statistics
export const getDashboardStats = async (req, res) => {
  try {
    const [totalUsers, pendingApprovals, activeConversations, totalMessages, suspendedUsers, todayRegistrations] =
      await Promise.all([
        User.countDocuments(),
        UserApproval.countDocuments({ status: "pending" }),
        Conversation.countDocuments({ "last_message.timestamp": { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } }),
        Message.countDocuments(),
        User.countDocuments({ is_active: false }),
        User.countDocuments({ createdAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) } }),
      ])

    const stats = {
      totalUsers,
      pendingApprovals,
      activeConversations,
      totalMessages,
      suspendedUsers,
      todayRegistrations,
      systemHealth: "healthy", // You can implement actual health checks
    }

    res.json(stats)
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch dashboard stats", error: error.message })
  }
}

// User Management
export const getAllUsersForAdmin = async (req, res) => {
  try {
    const { page = 1, limit = 20, search, status, role } = req.query

    const query = {}
    if (search) {
      query.$or = [{ name: { $regex: search, $options: "i" } }, { email: { $regex: search, $options: "i" } }]
    }
    if (status) query.is_active = status === "active"
    if (role) query.role = role

    const users = await User.find(query)
      .select("-password")
      .populate("friends", "name email")
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)

    const total = await User.countDocuments(query)

    res.json({
      users,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total,
    })
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch users", error: error.message })
  }
}

// User Approval Management
export const getPendingApprovals = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query

    const approvals = await UserApproval.find({ status: "pending" })
      .populate("user", "name email gender createdAt")
      .sort({ requested_at: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)

    const total = await UserApproval.countDocuments({ status: "pending" })

    res.json({
      approvals,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total,
    })
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch pending approvals", error: error.message })
  }
}

export const approveUser = async (req, res) => {
  try {
    const { approvalId } = req.params
    const { notes } = req.body
    const approval = await UserApproval.findById(approvalId).populate("user")
    if (!approval) {
      return res.status(404).json({ message: "Approval request not found" })
    }

    // Update approval status
    approval.status = "approved"
    approval.reviewed_at = new Date()
    approval.reviewed_by = req.user._id
    approval.approval_notes = notes
    await approval.save()

    // Activate user
    await User.findByIdAndUpdate(approval.user._id, { is_active: true })

    // Log activity
    await logAdminActivity(
      req.user,
      "approve_user",
      "user",
      approval.user._id,
      { user_email: approval.user.email, notes },
      req,
    )

    // Emit notification to user
    // req.io.to(approval.user._id.toString()).emit("accountApproved", {
    //   message: "Your account has been approved!",
    // })

    res.json({ message: "User approved successfully", approval })
  } catch (error) {
    res.status(500).json({ message: "Failed to approve user", error: error.message })
  }
}

export const rejectUser = async (req, res) => {
  try {
    const { approvalId } = req.params
    const { reason } = req.body

    const approval = await UserApproval.findById(approvalId).populate("user")
    if (!approval) {
      return res.status(404).json({ message: "Approval request not found" })
    }

    // Update approval status
    approval.status = "rejected"
    approval.reviewed_at = new Date()
    approval.reviewed_by = req.user._id
    approval.rejection_reason = reason
    await approval.save()

    // Deactivate user
    await User.findByIdAndUpdate(approval.user._id, { is_active: false })

    // Log activity
    await logAdminActivity(
      req.user,
      "reject_user",
      "user",
      approval.user._id,
      { user_email: approval.user.email, reason },
      req,
    )

    res.json({ message: "User rejected successfully", approval })
  } catch (error) {
    res.status(500).json({ message: "Failed to reject user", error: error.message })
  }
}

// Feature Controls
export const getAdminSettings = async (req, res) => {
  try {
    let settings = await AdminSettings.findOne().populate("updated_by", "name email")

    if (!settings) {
      // Create default settings if none exist
      settings = await AdminSettings.create({
        updated_by: req.user._id,
        features: {
          voice_messages: true,
          sms_notifications: true,
          image_sharing: true,
          video_sharing: true,
          file_sharing: true,
          voice_calling: true,
          video_calling: true,
          group_creation: true,
          user_registration: true,
        },
        security: {
          require_admin_approval: true,
          auto_approve_after_hours: 24,
          max_file_size_mb: 50,
          allowed_file_types: ["jpg", "jpeg", "png", "gif", "pdf", "doc", "docx"],
          message_encryption: true,
          two_factor_required: false,
          session_timeout_minutes: 60,
        },
      })
    }

    res.json(settings)
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch admin settings", error: error.message })
  }
}

export const updateAdminSettings = async (req, res) => {
  try {
    const updates = req.body

    let settings = await AdminSettings.findOne()
    if (!settings) {
      settings = new AdminSettings({ updated_by: req.user._id })
    }

    // Update settings
    Object.keys(updates).forEach((key) => {
      if (settings[key] && typeof settings[key] === "object") {
        Object.assign(settings[key], updates[key])
      } else {
        settings[key] = updates[key]
      }
    })

    settings.updated_by = req.user._id
    await settings.save()

    // Log activity
    await logAdminActivity(
      req.user,
      "update_settings",
      "settings",
      settings._id,
      { updated_fields: Object.keys(updates) },
      req,
    )

    // Broadcast settings update to all connected clients
    req.io.emit("settingsUpdated", {
      features: settings.features,
      security: settings.security,
    })

    res.json({ message: "Settings updated successfully", settings })
  } catch (error) {
    res.status(500).json({ message: "Failed to update settings", error: error.message })
  }
}

// User Actions
export const suspendUser = async (req, res) => {
  try {
    const { userId } = req.params
    const { reason, duration } = req.body

    const user = await User.findByIdAndUpdate(userId, { is_active: false }, { new: true })

    if (!user) {
      return res.status(404).json({ message: "User not found" })
    }

    // Log activity
    await logAdminActivity(req.user, "suspend_user", "user", userId, { reason, duration, user_email: user.email }, req)

    // Notify user
    req.io.to(userId).emit("accountSuspended", {
      message: "Your account has been suspended",
      reason,
    })

    res.json({ message: "User suspended successfully", user })
  } catch (error) {
    res.status(500).json({ message: "Failed to suspend user", error: error.message })
  }
}

export const unsuspendUser = async (req, res) => {
  try {
    const { userId } = req.params

    const user = await User.findByIdAndUpdate(userId, { is_active: true }, { new: true })

    if (!user) {
      return res.status(404).json({ message: "User not found" })
    }

    // Log activity
    await logAdminActivity(req.user, "unsuspend_user", "user", userId, { user_email: user.email }, req)

    res.json({ message: "User unsuspended successfully", user })
  } catch (error) {
    res.status(500).json({ message: "Failed to unsuspend user", error: error.message })
  }
}

// Activity Logs
export const getActivityLogs = async (req, res) => {
  try {
    const { page = 1, limit = 50, action, severity, admin } = req.query

    const query = {}
    if (action) query.action = action
    if (severity) query.severity = severity
    if (admin) query.admin = admin

    const logs = await AdminActivityLog.find(query)
      .populate("admin", "name email")
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)

    const total = await AdminActivityLog.countDocuments(query)

    res.json({
      logs,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total,
    })
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch activity logs", error: error.message })
  }
}

// System Monitoring
export const getSystemHealth = async (req, res) => {
  try {
    const [dbStatus, activeConnections, errorLogs, memoryUsage] = await Promise.all([
      // Database health check
      User.findOne()
        .then(() => "connected")
        .catch(() => "disconnected"),
      // Active socket connections (you'll need to implement this based on your socket setup)
      Promise.resolve(req.io?.engine?.clientsCount || 0),
      // Recent error logs
      AdminActivityLog.countDocuments({
        severity: { $in: ["high", "critical"] },
        createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      }),
      // Memory usage (basic implementation)
      Promise.resolve(process.memoryUsage()),
    ])

    const health = {
      database: dbStatus,
      activeConnections,
      recentErrors: errorLogs,
      memory: {
        used: Math.round(memoryUsage.heapUsed / 1024 / 1024),
        total: Math.round(memoryUsage.heapTotal / 1024 / 1024),
      },
      uptime: Math.floor(process.uptime()),
      status: dbStatus === "connected" && errorLogs < 10 ? "healthy" : "warning",
    }

    res.json(health)
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch system health", error: error.message })
  }
}
