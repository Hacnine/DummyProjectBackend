import mongoose from "mongoose"
import AssignmentSubmission from "../models/assignmentSubmissionModel.js"
import Conversation from "../models/conversationModel.js"

// Create assignment (for future use - assignment creation by teachers)
export const createAssignment = async (req, res) => {
  try {
    const { classId, title, description, dueDate, maxPoints } = req.body

    // Check if class exists and user is admin
    const classGroup = await Conversation.findById(classId)
    if (!classGroup || !classGroup.group.admins.includes(req.user._id)) {
      return res.status(403).json({ message: "Access denied" })
    }

    // For now, we'll just return success as we don't have Assignment model
    // In a full implementation, you'd create an Assignment model
    res.json({
      message: "Assignment created successfully",
      assignment: {
        id: Date.now().toString(),
        classId,
        title,
        description,
        dueDate,
        maxPoints,
        createdBy: req.user._id,
      },
    })
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

// Get assignments for a class
export const getClassAssignments = async (req, res) => {
  try {
    const { classId } = req.params
    const { page = 1, limit = 10 } = req.query

    // Check if user is member of the class
    const classGroup = await Conversation.findById(classId)
    if (!classGroup || !classGroup.participants.includes(req.user._id)) {
      return res.status(403).json({ message: "Access denied" })
    }

    const assignments = await AssignmentSubmission.find({ classId })
      .populate("userId", "name email image")
      .populate("markedBy", "name email")
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ submittedAt: -1 })

    const total = await AssignmentSubmission.countDocuments({ classId })

    res.json({
      assignments,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total,
    })
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

// Get assignment by ID
export const getAssignmentById = async (req, res) => {
  try {
    const { id } = req.params

    const assignment = await AssignmentSubmission.findById(id)
      .populate("userId", "name email image")
      .populate("markedBy", "name email")

    if (!assignment) {
      return res.status(404).json({ message: "Assignment not found" })
    }

    // Check if user has access to this assignment
    const classGroup = await Conversation.findById(assignment.classId)
    if (!classGroup || !classGroup.participants.includes(req.user._id)) {
      return res.status(403).json({ message: "Access denied" })
    }

    res.json({ assignment })
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

// Update assignment
export const updateAssignment = async (req, res) => {
  try {
    const { id } = req.params;
    const { assignmentTitle, assignmentDescription, file, mark, feedback } = req.body;

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid assignment ID" });
    }

    const assignment = await AssignmentSubmission.findById(id);
    if (!assignment) {
      return res.status(404).json({ message: "Assignment not found" });
    }

    // Check if user has permission (admin or teacher who marked)
    const classGroup = await Conversation.findById(assignment.classId);
    if (!classGroup) {
      return res.status(404).json({ message: "Class not found" });
    }

    // Define allowed updates
    const updates = {};
    if (assignmentTitle) updates.assignmentTitle = assignmentTitle;
    if (assignmentDescription) updates.assignmentDescription = assignmentDescription;
    if (file) updates.file = file;

    const updatedAssignment = await AssignmentSubmission.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true, runValidators: true }
    );

    return res.status(200).json({
      success: true,
      message: "Assignment updated successfully",
      data: updatedAssignment
    });
  } catch (error) {
    console.error('Error in updateAssignment:', error);
    return res.status(500).json({ 
      success: false,
      message: "Server error", 
      error: error.message 
    });
  }
};

// Delete assignment
export const deleteAssignment = async (req, res) => {
  try {
    const { id } = req.params

    const assignment = await AssignmentSubmission.findById(id)
    if (!assignment) {
      return res.status(404).json({ message: "Assignment not found" })
    }

    // Check if user is admin of the class or owner of submission
    const classGroup = await Conversation.findById(assignment.classId)
    const isAdmin = classGroup.group.admins.includes(req.user._id)
    const isOwner = assignment.userId.toString() === req.user._id.toString()

    if (!isAdmin && !isOwner) {
      return res.status(403).json({ message: "Access denied" })
    }

    await AssignmentSubmission.findByIdAndDelete(id)

    res.json({ message: "Assignment deleted successfully" })
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

// Submit assignment
export const submitAssignment = async (req, res) => {
  try {
    const { classId } = req.params
    const { assignmentTitle, assignmentDescription, file } = req.body
    const userId = req.user._id

    if (!assignmentTitle || !assignmentDescription) {
      return res.status(400).json({ message: "Assignment title and assignment description are required" })
    }

    // Check if user is a member of the class
    const classGroup = await Conversation.findById(classId)
    if (!classGroup || !classGroup.participants.includes(userId)) {
      return res.status(403).json({ message: "Access denied" })
    }

    const submission = new AssignmentSubmission({
      classId,
      userId,
      assignmentTitle,
      assignmentDescription,
      file,
    })

    await submission.save()
    await submission.populate("userId", "name email image")

    // Notify class admins via socket
    if (req.io) {
      classGroup.group.admins.forEach((adminId) => {
        req.io.to(adminId.toString()).emit("assignmentSubmitted", {
          classId,
          submission,
        })
      })
    }

    res.json({
      message: "Assignment submitted successfully",
      submission,
    })
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

// Get submissions for an assignment

export const getSubmissions = async (req, res) => {
  try {
    const { classId } = req.params; // classId
    const { page = 1, limit = 10 } = req.query;

    // Fetch submissions filtered by classId
    const submissions = await AssignmentSubmission.find({ classId: classId })
      .populate("userId", "name image")
      .populate("markedBy", "name ")
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ submittedAt: -1 });

    const total = await AssignmentSubmission.countDocuments({ classId: classId });

    res.json({
      submissions,
      totalPages: Math.ceil(total / limit),
      currentPage: Number(page),
      total,
    });
    console.log("Submissions:", submissions);
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Mark assignment
export const markAssignment = async (req, res) => {
  try {
    const { submissionId } = req.params
    const { mark, status, feedback } = req.body

    if (mark === undefined || mark < 0 || mark > 100) {
      return res.status(400).json({ message: "Valid mark (0-100) is required" })
    }

    const submission = await AssignmentSubmission.findById(submissionId)
    if (!submission) {
      return res.status(404).json({ message: "Submission not found" })
    }

    // Check if user is admin of the class
    const classGroup = await Conversation.findById(submission.classId)
    if (!classGroup.group.admins.includes(req.user._id)) {
      return res.status(403).json({ message: "Access denied" })
    }

    submission.mark = mark
    submission.status = status || 'Approved'
    submission.feedback = feedback
    submission.markedBy = req.user._id
    submission.markedAt = new Date()

    await submission.save()
    await submission.populate([
  { path: "userId", select: "name email image" },
  { path: "markedBy", select: "name email image" },
])


    // Notify student via socket
    if (req.io) {
      req.io.to(submission.userId._id.toString()).emit("assignmentMarked", {
        submissionId,
        mark,
        feedback,
      })
    }

    res.json({
      message: "Assignment marked successfully",
      submission,
    })
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

// Get user's assignments
export const getUserAssignments = async (req, res) => {
  try {
    const userId = req.user._id
    const { page = 1, limit = 10 } = req.query

    const assignments = await AssignmentSubmission.find({ userId })
      .populate("markedBy", "name email")
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ submittedAt: -1 })

    const total = await AssignmentSubmission.countDocuments({ userId })

    res.json({
      assignments,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total,
    })
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

// Download submission file
export const downloadSubmission = async (req, res) => {
  try {
    const { submissionId } = req.params

    const submission = await AssignmentSubmission.findById(submissionId)
    if (!submission) {
      return res.status(404).json({ message: "Submission not found" })
    }

    // Check if user has access
    const classGroup = await Conversation.findById(submission.classId)
    const hasAccess = classGroup.participants.includes(req.user._id)

    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied" })
    }

    // In a real implementation, you'd serve the actual file
    res.json({
      message: "File download initiated",
      file: submission.file,
    })
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

// Get assignment statistics
export const getAssignmentStats = async (req, res) => {
  try {
    const { id } = req.params

    // For now, return basic stats
    const stats = await AssignmentSubmission.aggregate([
      { $match: { _id: id } },
      {
        $group: {
          _id: null,
          totalSubmissions: { $sum: 1 },
          averageMark: { $avg: "$mark" },
          markedCount: {
            $sum: { $cond: [{ $ne: ["$mark", null] }, 1, 0] },
          },
        },
      },
    ])

    res.json({
      stats: stats.length > 0 ? stats[0] : { totalSubmissions: 0, averageMark: 0, markedCount: 0 },
    })
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message })
  }
}
