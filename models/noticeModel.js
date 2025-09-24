import mongoose from "mongoose";
const { Schema } = mongoose;

const noticeSchema = new Schema(
  {
    title: { type: String, required: true },
    content: { type: String, required: true },

    // Single string instead of array
    targetAudience: {
      type: String,
      enum: ["all", "admin", "teacher"],
      required: true,
    },

    eventType: {
      type: String,
      enum: ["general", "holiday", "exam", "meeting", "special", "announcement"],
      default: "general",
    },

    creator: { type: Schema.Types.ObjectId, ref: "User", required: true },
    recipients: [{ type: Schema.Types.ObjectId, ref: "User" }],
    isActive: { type: Boolean, default: true },

    eventDate: { type: Date }, // Required for certain eventTypes like holidays or meetings
    location: { type: String }, // Optional, for events like meetings
  },
  { timestamps: true }
);

// indexes
noticeSchema.index({ creator: 1 });
noticeSchema.index({ createdAt: -1 });
noticeSchema.index({ eventType: 1 });
noticeSchema.index({ targetAudience: 1 });

const Notice = mongoose.model("Notice", noticeSchema);
export default Notice;
