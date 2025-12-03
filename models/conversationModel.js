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
    
    // Granular message permissions for the conversation
    messagePermissions: {
      text: { type: Boolean, default: true },
      image: { type: Boolean, default: true },
      voice: { type: Boolean, default: false },
      video: { type: Boolean, default: false },
      file: { type: Boolean, default: false },
      sticker: { type: Boolean, default: true },
      gif: { type: Boolean, default: true },
    },
    
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
      type: Number, // in hours (0 = disabled/off)
      default: 24,
      min: 0,
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

    // Conversation-specific encryption keys (per participant)
    // Now supports up to 3 keys per user for backward compatibility with old messages
    keyExchange: {
      status: {
        type: String,
        enum: ["none", "pending", "partial", "complete"],
        default: "none",
      },
      participants: {
        type: Map,
        of: Schema.Types.Mixed, // Store array of key objects: [{publicKey, keyId, keyVersion, exchangedAt, isActive}]
      },
      createdAt: { type: Date, default: null },
      lastActivity: { type: Date, default: null },
    },
    
    // V1 Encryption keys (CryptoJS AES + Corruption)
    v1Keys: {
      type: Map,
      of: Schema.Types.Mixed, // Store V1 key objects: {key: string, updatedAt: Date}
      default: new Map()
    },
  },
  { timestamps: true }
);

// Add indexes for common queries
conversationSchema.index({ visibility: 1 });
conversationSchema.index({ "group.type": 1 });
conversationSchema.index({ participants: 1, updatedAt: -1 });

conversationSchema.pre("save", function (next) {
  if (
    this.group &&
    this.group.type === "group" &&
    (!this.group.image ||
      this.group.image === "/images/cover/default-cover.jpg")
  ) {
    this.group.image = "/images/cover/default-group.png";
  }
  next();
});

const Conversation = mongoose.model("Conversation", conversationSchema);
export default Conversation;
