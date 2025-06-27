import mongoose from "mongoose";
const { Schema } = mongoose;

const conversationSchema = new Schema(
  {
    participants: [
      { type: Schema.Types.ObjectId, ref: "User", required: true },
    ],
    receiverId: { type: Schema.Types.ObjectId, ref: "User" },
    senderId: { type: Schema.Types.ObjectId, ref: "User" },
    status: {
      type: String,
      enum: ["pending", "accepted", "rejected"],
      default: "pending",
    },
    visibility: {
      type: String,
      enum: ["public", "private"],
      default: "private",
      required: true,
    },
    group: {
      is_group: { type: Boolean, default: false },
      type: {
        type: String,
        enum: ["group", "classroom"],
        default: "group",
      },
      name: { type: String },
      image: { type: String }, // Group profile picture
      admins: [{ type: Schema.Types.ObjectId, ref: "User" }], // Users with admin rights

      // ✅ Extended fields for classroom functionality
      classType: {
        type: String,
        enum: ["regular", "exam"],
        default: "regular",
      },
      fileSendingAllowed: { type: Boolean, default: true },
      moderators: [{ type: Schema.Types.ObjectId, ref: "User" }],
      members: [{ type: Schema.Types.ObjectId, ref: "User" }],
    },
    themeIndex: { type: Number, default: 6, required: false },
    last_message: {
      message: { type: String, default: "" },
      sender: { type: Schema.Types.ObjectId, ref: "User" }, // Last sender
      timestamp: { type: Date, default: Date.now },
    },
    unread_messages: [
      {
        user: { type: Schema.Types.ObjectId, ref: "User" },
        count: { type: Number, default: 0 },
      },
    ],
  },
  { timestamps: true }
);

// Add indexes for common queries
conversationSchema.index({ participants: 1 });
conversationSchema.index({ visibility: 1 });
conversationSchema.index({ "group.type": 1 });

const Conversation = mongoose.model("Conversation", conversationSchema);
export default Conversation;
