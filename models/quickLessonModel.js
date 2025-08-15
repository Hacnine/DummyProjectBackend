import mongoose from "mongoose";
const { Schema } = mongoose;

const quickLessonSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    conversationId: { type: Schema.Types.ObjectId, ref: "Conversation", required: true },
    lessonName: { type: String, required: true },
    lessonParts: [{ type: String, required: true }],
  },
  { timestamps: true }
);

const QuickLesson = mongoose.model("QuickLesson", quickLessonSchema);
export default QuickLesson;