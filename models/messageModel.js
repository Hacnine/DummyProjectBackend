import mongoose from "mongoose";
const { Schema } = mongoose;

const messageSchema = new Schema(
  {
    conversation: {
      type: Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
    },

    sender: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    receiver: {
      type: Schema.Types.ObjectId,
      ref: "User",
    }, // Optional for group messages

    text: {
      type: String,
      default:null
    },

    messageType: {
      type: String,
      enum: ["text", "image", "video", "audio", "file", "system", "reply"],
      default: "text",
    },

    media: [
      {
        url: { type: String, required: false },
        type: {
          type: String,
          enum: ["image", "video", "audio", "file"],
          required: false,
        },
        filename: { type: String },
        size: { type: Number }, // bytes
      },
    ],

    htmlEmoji: {
      type: String,
      default: null,
    }, // Stores HTML emoji (e.g., 😊) for custom or standard emojis

    emojiType: {
      type: String,
      enum: ["custom", "standard", null],
      default: null,
    }, // Indicates custom emoji (with image) or standard HTML emoji

    replyTo: {
      type: Schema.Types.ObjectId,
      ref: "Message",
    }, // Quoted reply

    readBy: [
      {
        user: { type: Schema.Types.ObjectId, ref: "User" },
        readAt: { type: Date, default: Date.now },
      },
    ],
    deletedBy: [{ type: Schema.Types.ObjectId, ref: "User" }], // Soft delete

    edited: {
      type: Boolean,
      default: false,
    },

    editHistory: [
      {
        text: String,
        editedAt: { type: Date, default: Date.now },
      },
    ],
  },
  {
    timestamps: true,
  }
);

// Indexes
messageSchema.index({ conversation: 1, createdAt: -1 });
messageSchema.index({ sender: 1 });
messageSchema.index({ messageType: 1 });
messageSchema.index({ "media.type": 1 });
messageSchema.index({ emojiType: 1 }); // Optional: Index for faster emojiType queries

const Message = mongoose.model("Message", messageSchema);
export default Message;