import mongoose from "mongoose";
const { Schema } = mongoose;

const attendanceLogSchema = new Schema(
  {
    sessionId: { type: Schema.Types.ObjectId, ref: "Session", required: true },
    classId: { type: Schema.Types.ObjectId, ref: "Conversation", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    status: {
      type: String,
      enum: ["present", "late", "absent", "excused"],
      default: "absent",
    },
    enteredAt: { type: Date },
    leftAt: { type: Date },
    duration: { type: Number }, // in minutes
    sessionDate: { type: String, required: true }, // YYYY-MM-DD format
  },
  { timestamps: true }
);

attendanceLogSchema.index({ sessionId: 1, userId: 1, sessionDate: 1 }, { unique: true });
attendanceLogSchema.index({ enteredAt: -1 });

const AttendanceLog = mongoose.model("AttendanceLog", attendanceLogSchema);
export default AttendanceLog;