import mongoose from "mongoose"
const { Schema } = mongoose

const alertnessSessionSchema = new Schema(
  {
    classId: { type: Schema.Types.ObjectId, ref: "Conversation", required: true },
    startedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    duration: { type: Number, required: true }, // in milliseconds
    startTime: { type: Date, default: Date.now },
    endTime: { type: Date },
    isActive: { type: Boolean, default: true },
    responses: [
      {
        userId: { type: Schema.Types.ObjectId, ref: "User" },
        respondedAt: { type: Date, default: Date.now },
        responseTime: { type: Number }, // time taken to respond in ms
      },
    ],
    totalParticipants: { type: Number, default: 0 },
    responseRate: { type: Number, default: 0 }, // percentage
  },
  { timestamps: true },
)

alertnessSessionSchema.index({ classId: 1, startTime: -1 })
alertnessSessionSchema.index({ isActive: 1 })

const AlertnessSession = mongoose.model("AlertnessSession", alertnessSessionSchema)
export default AlertnessSession
