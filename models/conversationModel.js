import mongoose from "mongoose";
const { Schema } = mongoose;

const conversationSchema = new Schema(
  {
    participants: [
      { type: Schema.Types.ObjectId, ref: "User", required: true },
    ],
    status: {
      type: String,
      enum: ["pending", "accepted", "rejected"],
      default: "pending",
    },
    visibility: {
      type: String,
      enum: ["public", "private"],
      default: "public",
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
      intro: { type: String },
      image: { type: String, default: "/images/cover/default-cover.jpg" },
      admins: [{ type: Schema.Types.ObjectId, ref: "User" }],

      classType: {
        type: String,
        enum: ["regular", "weekly", "multi-weekly", "monthly", "exam"],
        default: "regular",
      },
      fileSendingAllowed: { type: Boolean, default: false },
      moderators: [{ type: Schema.Types.ObjectId, ref: "User" }],
      startTime: { type: String, default: "09:00" },
      cutoffTime: { type: String, default: "09:15" },
      checkInterval: { type: Number, default: 15 },
      selectedDays: [
        {
          type: Number,
          min: 0,
          max: 6,
          validate: {
            validator: function (days) {
              if (
                this.classType === "multi-weekly" &&
                (!days || days.length === 0)
              ) {
                return false;
              }
              return true;
            },
            message: "selectedDays is required for multi-weekly classes",
          },
        },
      ], // 0 = Sunday, 6 = Saturday
    },
    themeIndex: { type: Number, default: 0, required: false },
    last_message: {
      message: { type: String, default: "" },
      sender: { type: Schema.Types.ObjectId, ref: "User" }, // Last sender
      timestamp: { type: Date, default: Date.now },
    },
    unread_messages: [
      {
        user: { type: Schema.Types.ObjectId, ref: "User", required: true },
        count: { type: Number, default: 0 },
      },
    ],
    autoDeleteMessagesAfter: {
      type: Number, // in hours
      default: 24,
      min: 1,
    },
    blockList: [
      {
        blockedBy: { type: Schema.Types.ObjectId, ref: "User", required: true }, // Who blocked
        blockedUser: {
          type: Schema.Types.ObjectId,
          ref: "User",
          required: true,
        }, // Who is blocked
        blockedAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

// Add indexes for common queries
conversationSchema.index({ visibility: 1 });
conversationSchema.index({ "group.type": 1 });
conversationSchema.index({ participants: 1, updatedAt: -1 });

const Conversation = mongoose.model("Conversation", conversationSchema);
export default Conversation;
