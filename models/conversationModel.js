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
    group: {
      is_group: { type: Boolean, default: false },
      name: { type: String },
      image: { type: String }, // Group profile picture
      admins: [{ type: Schema.Types.ObjectId, ref: "User" }], // Users with admin rights
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

const Conversation = mongoose.model("Conversation", conversationSchema);
export default Conversation;
