import mongoose from "mongoose";
const { Schema, Decimal128 } = mongoose;

const chatSchema = new mongoose.Schema(
  {
    sender_id: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    receiver_id: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    message: {
      type: String,
      required: true,
    },
    timestamps: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// export default {chatSchema};


// import mongoose from "mongoose";
// const { Schema } = mongoose;

// // Message Schema
// const messageSchema = new Schema(
//   {
//     sender: { type: Schema.Types.ObjectId, ref: "User", required: true },
//     receiver: { type: Schema.Types.ObjectId, ref: "User" }, // Null for group messages
//     text: { type: String },
//     attachments: [
//       {
//         file_url: { type: String },
//         file_type: { type: String }, // image, video, document, etc.
//         file_size: { type: Number }, // In bytes
//       },
//     ],
//     edited: { type: Boolean, default: false },
//     edited_messages: [
//       {
//         text: { type: String },
//         timestamp: { type: Date, default: Date.now },
//       },
//     ],
//     deleted: { type: Boolean, default: false },
//     conversation: { type: Schema.Types.ObjectId, ref: "Conversation", required: true },
//     reactions: [
//       {
//         user: { type: Schema.Types.ObjectId, ref: "User" },
//         emoji: { type: String }, // Like 👍, Love ❤️, etc.
//       },
//     ],
//     replies: [{ type: Schema.Types.ObjectId, ref: "Message" }], // Threaded messages
//     status: {
//       delivered: { type: Boolean, default: false },
//       seen_by: [{ type: Schema.Types.ObjectId, ref: "User" }], // List of users who have seen the message
//     },
//   },
//   { timestamps: true }
// );

// const Message = mongoose.model("Message", messageSchema);
// export default Message;

