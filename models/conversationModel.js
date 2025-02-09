
import mongoose from "mongoose";
const { Schema } = mongoose;

const conversationSchema = new Schema(
    {
      participants: [{ type: Schema.Types.ObjectId, ref: "User", required: true }],
      group: {
        is_group: { type: Boolean, default: false },
        name: { type: String },
        image: { type: String }, // Group profile picture
        admins: [{ type: Schema.Types.ObjectId, ref: "User" }], // Users with admin rights
      },
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
      typing_users: [{ type: Schema.Types.ObjectId, ref: "User" }], // Users currently typing
    },
    { timestamps: true }
  );
  
  const Conversation = mongoose.model("Conversation", conversationSchema);
  export default Conversation;
  