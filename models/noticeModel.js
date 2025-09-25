import mongoose from "mongoose";
const { Schema } = mongoose;

const noticeSchema = new Schema(
  {
    title: { type: String, required: true },
    content: { type: String, required: true },
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
    eventDate: { type: Date },
    location: { type: String },
    likes: [{ type: Schema.Types.ObjectId, ref: "User" }], 
    readBy: [{ type: Schema.Types.ObjectId, ref: "User" }], 
  },
  { timestamps: true }
);

// Indexes
noticeSchema.index({ creator: 1 });
noticeSchema.index({ createdAt: -1 });
noticeSchema.index({ eventType: 1 });
noticeSchema.index({ targetAudience: 1 });
noticeSchema.index({ likes: 1 });
noticeSchema.index({ readBy: 1 }); 

const Notice = mongoose.model("Notice", noticeSchema);
export default Notice;