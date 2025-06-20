// Script to create default admin settings
import mongoose from "mongoose"
import AdminSettings from "../models/adminSettingsModel.js"
import User from "../models/userModel.js"

const seedAdminSettings = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || "mongodb://localhost:27017/chatapp")

    // Find admin user
    const adminUser = await User.findOne({ role: "superadmin" })
    if (!adminUser) {
      console.log("No super admin found. Please create an admin user first.")
      return
    }

    // Check if settings already exist
    const existingSettings = await AdminSettings.findOne()
    if (existingSettings) {
      console.log("Admin settings already exist")
      return
    }

    // Create default settings
    const defaultSettings = new AdminSettings({
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
        allowed_file_types: ["jpg", "jpeg", "png", "gif", "pdf", "doc", "docx", "mp3", "mp4"],
        message_encryption: true,
        two_factor_required: false,
        session_timeout_minutes: 60,
      },
      moderation: {
        auto_moderate_messages: false,
        blocked_words: ["spam", "abuse"],
        max_message_length: 1000,
        spam_detection: true,
        image_content_filter: false,
      },
      rate_limits: {
        messages_per_minute: 30,
        files_per_hour: 10,
        friend_requests_per_day: 20,
        group_creation_per_day: 5,
      },
      notifications: {
        admin_email_alerts: true,
        new_user_notifications: true,
        suspicious_activity_alerts: true,
        system_maintenance_mode: false,
      },
      updated_by: adminUser._id,
    })

    await defaultSettings.save()
    console.log("Default admin settings created successfully!")
  } catch (error) {
    console.error("Error creating admin settings:", error)
  } finally {
    await mongoose.disconnect()
  }
}

seedAdminSettings()
