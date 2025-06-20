import mongoose from "mongoose";
const { Schema } = mongoose;

const quickMessageSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true }, // Owner
    title: { type: String, required: true },
    message: { type: String, required: true },
  },
  { timestamps: true }
);

const QuickMessage = mongoose.model("QuickMessage", quickMessageSchema);
export default QuickMessage;