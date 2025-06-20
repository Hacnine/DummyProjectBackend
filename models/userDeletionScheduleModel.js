import mongoose from "mongoose"
const { Schema } = mongoose

const userDeletionScheduleSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    scheduled_for: { type: Date, required: true },
    reason: { type: String, default: "Inactive for 7+ months" },
    status: {
      type: String,
      enum: ["scheduled", "prevented", "deleted", "cancelled"],
      default: "scheduled",
    },
    prevented_by: { type: Schema.Types.ObjectId, ref: "User" },
    prevented_at: { type: Date },
    prevention_reason: { type: String },
    last_activity: { type: Date },
    notification_sent: { type: Boolean, default: false },
    final_warning_sent: { type: Boolean, default: false },
  },
  { timestamps: true },
)

const UserDeletionSchedule = mongoose.model("UserDeletionSchedule", userDeletionScheduleSchema)
export default UserDeletionSchedule
