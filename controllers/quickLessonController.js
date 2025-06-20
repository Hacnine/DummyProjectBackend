import QuickLesson from "../models/quickLessonModel.js";

// Get all lessons for a user
export const getQuickLessons = async (req, res) => {
  try {
    const lessons = await QuickLesson.find({ user: req.user._id });
    res.json(lessons);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};

// Add a new lesson
export const addQuickLesson = async (req, res) => {
  try {
    const { lessonName, lessonParts } = req.body;
    const lesson = new QuickLesson({
      user: req.user._id,
      lessonName,
      lessonParts,
    });
    await lesson.save();
    res.status(201).json(lesson);
  } catch (err) {
    res.status(400).json({ message: "Failed to add lesson" });
  }
};

// Edit a lesson
export const editQuickLesson = async (req, res) => {
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
};

// Delete a lesson
export const deleteQuickLesson = async (req, res) => {
  try {
    const { id } = req.params;
    const lesson = await QuickLesson.findOneAndDelete({ _id: id, user: req.user._id });
    if (!lesson) return res.status(404).json({ message: "Lesson not found" });
    res.json({ message: "Lesson deleted" });
  } catch (err) {
    res.status(400).json({ message: "Failed to delete lesson" });
  }
};