import mongoose from "mongoose";
const { Schema } = mongoose;

const permissionRequestSchema = new Schema(
  {
    conversation: {
      type: Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
    },
    requester: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    permissionType: {
      type: String,
      enum: ["text", "image", "voice", "video", "file", "sticker", "gif"],
      required: true,
    },
    reason: {
      type: String,
      maxlength: 500,
      default: "",
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
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
    reviewNote: {
      type: String,
      maxlength: 500,
      default: "",
    },
  },
  { timestamps: true }
);

// Indexes for common queries
permissionRequestSchema.index({ conversation: 1, requester: 1, status: 1 });
permissionRequestSchema.index({ status: 1, createdAt: -1 });

const PermissionRequest = mongoose.model("PermissionRequest", permissionRequestSchema);
export default PermissionRequest;
