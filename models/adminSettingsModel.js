import mongoose from "mongoose"
const { Schema } = mongoose

const adminSettingsSchema = new Schema(
  {
    // Feature Controls
    features: {
      voice_messages: { type: Boolean, default: true },
      sms_notifications: { type: Boolean, default: true },
      image_sharing: { type: Boolean, default: true },
      video_sharing: { type: Boolean, default: true },
      file_sharing: { type: Boolean, default: true },
      voice_calling: { type: Boolean, default: true },
      video_calling: { type: Boolean, default: true },
      group_creation: { type: Boolean, default: true },
      user_registration: { type: Boolean, default: true },
    },

    // Security Settings
    security: {
      require_admin_approval: { type: Boolean, default: true },
      auto_approve_after_hours: { type: Number, default: 24 },
      max_file_size_mb: { type: Number, default: 50 },
      allowed_file_types: [{ type: String }],
      message_encryption: { type: Boolean, default: true },
      two_factor_required: { type: Boolean, default: false },
      session_timeout_minutes: { type: Number, default: 60 },
    },

    // Content Moderation
    moderation: {
      auto_moderate_messages: { type: Boolean, default: false },
      blocked_words: [{ type: String }],
      max_message_length: { type: Number, default: 1000 },
      spam_detection: { type: Boolean, default: true },
      image_content_filter: { type: Boolean, default: false },
    },

    // Rate Limiting
    rate_limits: {
      messages_per_minute: { type: Number, default: 30 },
      files_per_hour: { type: Number, default: 10 },
      friend_requests_per_day: { type: Number, default: 20 },
      group_creation_per_day: { type: Number, default: 5 },
    },

    // Notification Settings
    notifications: {
      admin_email_alerts: { type: Boolean, default: true },
      new_user_notifications: { type: Boolean, default: true },
      suspicious_activity_alerts: { type: Boolean, default: true },
      system_maintenance_mode: { type: Boolean, default: false },
    },

    updated_by: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true },
)

const AdminSettings = mongoose.model("AdminSettings", adminSettingsSchema)
export default AdminSettings
