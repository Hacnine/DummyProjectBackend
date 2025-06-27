import mongoose from "mongoose"
const { Schema } = mongoose

const joinRequestSchema = new Schema(
  {
    classId: { type: Schema.Types.ObjectId, ref: "Conversation", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    requestedAt: { type: Date, default: Date.now },
    processedAt: { type: Date },
    processedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
)

joinRequestSchema.index({ classId: 1, userId: 1 }, { unique: true })
joinRequestSchema.index({ status: 1 })

const JoinRequest = mongoose.model("JoinRequest", joinRequestSchema)
export default JoinRequest
