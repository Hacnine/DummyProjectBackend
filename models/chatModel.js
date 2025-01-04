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

export default {chatSchema};