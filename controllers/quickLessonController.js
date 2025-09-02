import mongoose from "mongoose";
import QuickLesson from "../models/quickLessonModel.js";
import User from "../models/userModel.js";

// Middleware to check if user is teacher or superadmin
const restrictToTeacherOrSuperadmin = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user || !['teacher', 'superadmin'].includes(user.role)) {
      return res.status(403).json({ message: "Unauthorized: Only teachers or superadmins can perform this action" });
    }
    next();
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};

export const getQuickLessons = [
  restrictToTeacherOrSuperadmin,
  async (req, res) => {
    try {
      const { conversationId } = req.query; // Get conversationId from query parameters
      if (!conversationId) {
        return res.status(400).json({ message: 'conversationId is required' });
      }

      // Validate conversationId is a valid ObjectId
      if (!mongoose.Types.ObjectId.isValid(conversationId)) {
        return res.status(400).json({ message: 'Invalid conversationId' });
      }

      const lessons = await QuickLesson.find({
        user: req.user._id,
        conversationId: conversationId,
      });

      res.json(lessons);
    } catch (err) {
      console.error('Error fetching quick lessons:', err);
      res.status(500).json({ message: 'Server error' });
    }
  },
];

// Add a new lesson
export const addQuickLesson = [restrictToTeacherOrSuperadmin, async (req, res) => {
  try {
    const { lessonName, lessonParts, conversationId } = req.body;
    const lesson = new QuickLesson({
      user: req.user._id,
      conversationId,
      lessonName,
      lessonParts,
    });
    await lesson.save();
    res.status(201).json(lesson);
  } catch (err) {
    res.status(400).json({ message: "Failed to add lesson" });
  }
}];

// Edit a lesson
export const editQuickLesson = [restrictToTeacherOrSuperadmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { lessonName, lessonParts } = req.body;
    const lesson = await QuickLesson.findOneAndUpdate(
      { _id: id, user: req.user._id },
      { lessonName, lessonParts },
      { new: true }
    );
    if (!lesson) return res.status(404).json({ message: "Lesson not found" });
    res.json(lesson);
  } catch (err) {
    res.status(400).json({ message: "Failed to edit lesson" });
  }
}];

// Delete a lesson
export const deleteQuickLesson = [restrictToTeacherOrSuperadmin, async (req, res) => {
  try {
    const { id } = req.params;
    const lesson = await QuickLesson.findOneAndDelete({ _id: id, user: req.user._id });
    if (!lesson) return res.status(404).json({ message: "Lesson not found" });
    res.json({ message: "Lesson deleted" });
  } catch (err) {
    res.status(400).json({ message: "Failed to delete lesson" });
  }
}];