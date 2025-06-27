import mongoose from "mongoose"
const { Schema } = mongoose

const attendanceLogSchema = new Schema(
  {
    classId: { type: Schema.Types.ObjectId, ref: "Conversation", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    enteredAt: { type: Date, default: Date.now },
    leftAt: { type: Date },
    duration: { type: Number }, // in minutes
    sessionDate: { type: String, required: true }, // YYYY-MM-DD format
  },
  { timestamps: true },
)

attendanceLogSchema.index({ classId: 1, userId: 1, sessionDate: 1 })
attendanceLogSchema.index({ enteredAt: -1 })

const AttendanceLog = mongoose.model("AttendanceLog", attendanceLogSchema)
export default AttendanceLog
