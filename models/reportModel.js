import mongoose from "mongoose";
const { Schema } = mongoose;

const reportSchema = new Schema(
  {
    reporter: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    reportedUser: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    conversation: {
      type: Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
    },
    reason: {
      type: String,
      enum: [
        "spam",
        "harassment",
        "hate_speech",
        "violence",
        "nudity",
        "false_info",
        "impersonation",
        "other",
      ],
      required: true,
    },
    details: {
      type: String,
      maxlength: 1000,
      default: "",
    },
    status: {
      type: String,
      enum: ["pending", "reviewed", "resolved", "dismissed"],
      default: "pending",
    },
    reviewedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    reviewedAt: {
      type: Date,
      default: null,
    },
    resolution: {
      type: String,
      maxlength: 500,
      default: "",
    },
    actionTaken: {
      type: String,
      enum: ["none", "warning", "temporary_ban", "permanent_ban", "content_removed"],
      default: "none",
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
reportSchema.index({ reporter: 1, conversation: 1 });
reportSchema.index({ reportedUser: 1 });
reportSchema.index({ status: 1 });
reportSchema.index({ createdAt: -1 });

// Prevent duplicate reports from same user for same conversation within 24 hours
reportSchema.index(
  { reporter: 1, conversation: 1, createdAt: 1 },
  { unique: false }
);

const Report = mongoose.model("Report", reportSchema);
export default Report;
