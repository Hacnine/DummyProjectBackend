import Notification from "../models/notificationModel.js"

// Get user notifications
export const getUserNotifications = async (req, res) => {
  try {
    const userId = req.user._id
    const { page = 1, limit = 20, unreadOnly = false } = req.query

    const query = { recipient: userId }
    if (unreadOnly === "true") {
      query.isRead = false
    }

    const notifications = await Notification.find(query)
      .populate("sender", "name email image")
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ createdAt: -1 })

    const total = await Notification.countDocuments(query)

    res.json({
      notifications,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total,
    })
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

// Mark notification as read
export const markNotificationAsRead = async (req, res) => {
  try {
    const { id } = req.params
    const userId = req.user._id

    const notification = await Notification.findOne({ _id: id, recipient: userId })
    if (!notification) {
      return res.status(404).json({ message: "Notification not found" })
    }

    notification.isRead = true
    notification.readAt = new Date()
    await notification.save()

    res.json({ message: "Notification marked as read" })
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

// Mark all notifications as read
export const markAllNotificationsAsRead = async (req, res) => {
  try {
    const userId = req.user._id

    await Notification.updateMany({ recipient: userId, isRead: false }, { isRead: true, readAt: new Date() })

    res.json({ message: "All notifications marked as read" })
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

// Delete notification
export const deleteNotification = async (req, res) => {
  try {
    const { id } = req.params
    const userId = req.user._id

    const notification = await Notification.findOne({ _id: id, recipient: userId })
    if (!notification) {
      return res.status(404).json({ message: "Notification not found" })
    }

    await Notification.findByIdAndDelete(id)

    res.json({ message: "Notification deleted successfully" })
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

// Get unread notification count
export const getUnreadNotificationCount = async (req, res) => {
  try {
    const userId = req.user._id

    const count = await Notification.countDocuments({
      recipient: userId,
      isRead: false,
    })

    res.json({ count })
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

// Update notification settings
export const updateNotificationSettings = async (req, res) => {
  try {
    const userId = req.user._id
    const settings = req.body

    // In a real implementation, you'd have a UserSettings model
    // For now, we'll just return success
    res.json({
      message: "Notification settings updated successfully",
      settings,
    })
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

// Get notification settings
export const getNotificationSettings = async (req, res) => {
  try {
    const userId = req.user._id

    // In a real implementation, you'd fetch from UserSettings model
    const defaultSettings = {
      emailNotifications: true,
      pushNotifications: true,
      assignmentReminders: true,
      classUpdates: true,
      messageNotifications: true,
    }

    res.json({ settings: defaultSettings })
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message })
  }
}
