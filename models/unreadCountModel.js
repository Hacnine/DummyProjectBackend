import mongoose from "mongoose";
const { Schema } = mongoose;

const unreadCountSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true, // This alone ensures uniqueness
    },

    unreadFriendRequestCount: {
      type: Number,
      default: 0,
    },
    unreadGroupRequestCount: {
      type: Number,
      default: 0,
    },
    unreadClassRequestCount: {
      type: Number,
      default: 0,
    },

    unreadMessages: [
      {
        conversation: { type: Schema.Types.ObjectId, ref: "Conversation", required: true },
        count: { type: Number, default: 0 },
      },
    ],
  },
  { timestamps: true }
);

unreadCountSchema.index({ "unreadMessages.conversation": 1 });

const UnreadCount = mongoose.model("UnreadCount", unreadCountSchema);
export default UnreadCount;
