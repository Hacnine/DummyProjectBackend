import mongoose from "mongoose"
const { Schema } = mongoose

const adminActivityLogSchema = new Schema(
  {
    admin: { type: Schema.Types.ObjectId, ref: "User", required: true },
    action: { type: String, required: true },
    target_type: {
      type: String,
      enum: ["user", "conversation", "message", "settings", "system"],
      required: true,
    },
    target_id: { type: Schema.Types.ObjectId },
    details: { type: Schema.Types.Mixed },
    // ip_address: { type: String },
    user_agent: { type: String },
    severity: {
      type: String,
      enum: ["low", "medium", "high", "critical"],
      default: "low",
    },
  },
  { timestamps: true },
)

const AdminActivityLog = mongoose.model("AdminActivityLog", adminActivityLogSchema)
export default AdminActivityLog
