import mongoose from "mongoose";
const { Schema } = mongoose;

const quickLessonSchema = new Schema(
  {
    lessonName: { type: String, required: true },
    lessonParts: [{ type: String, required: true }],
    user: { type: Schema.Types.ObjectId, ref: "User", required: true }, // Optional: for user-specific lessons
  },
  { timestamps: true }
);

const QuickLesson = mongoose.model("QuickLesson", quickLessonSchema);
export default QuickLesson;