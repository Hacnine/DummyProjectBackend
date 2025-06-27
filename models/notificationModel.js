import mongoose from "mongoose"
const { Schema } = mongoose

const notificationSchema = new Schema(
  {
    recipient: { type: Schema.Types.ObjectId, ref: "User", required: true },
    sender: { type: Schema.Types.ObjectId, ref: "User" },
    type: {
      type: String,
      enum: ["assignment", "grade", "class_invite", "join_request", "message", "system"],
      required: true,
    },
    title: { type: String, required: true },
    message: { type: String, required: true },
    data: { type: Schema.Types.Mixed }, // Additional data specific to notification type
    isRead: { type: Boolean, default: false },
    readAt: { type: Date },
  },
  { timestamps: true },
)

notificationSchema.index({ recipient: 1, isRead: 1 })
notificationSchema.index({ createdAt: -1 })

const Notification = mongoose.model("Notification", notificationSchema)
export default Notification
