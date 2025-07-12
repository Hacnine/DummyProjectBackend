import mongoose from "mongoose";
const { Schema } = mongoose;

const sessionSchema = new Schema(
  {
    classId: {
      type: Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
    },
    date: { type: String, required: true }, // YYYY-MM-DD format
    startTime: { type: String, required: true }, // HH:MM format (24-hour)
    type: {
      type: String,
      enum: ["auto", "manual"],
      default: "auto",
    },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" }, // For manual sessions
    status: {
      type: String,
      enum: ["scheduled", "ongoing", "completed"],
      default: "scheduled",
    },
    duration: { type: Number, default:70 }, // In minutes, optional
    cutoffTime: { type: String }, // HH:MM format for marking absent
  },
  { timestamps: true }
);

sessionSchema.index({ classId: 1, date: 1, startTime: 1 }, { unique: true });sessionSchema.index({ status: 1 });

const Session = mongoose.model("Session", sessionSchema);
export default Session;
