import Conversation from "../models/conversationModel.js";
import JoinRequest from "../models/joinRequestModel.js";
import AssignmentSubmission from "../models/assignmentSubmissionModel.js";
import AttendanceLog from "../models/attendanceLogModel.js";
import AlertnessSession from "../models/alertnessSessionModel.js";
import User from "../models/userModel.js";
import { scheduleSessionCronForClass } from "../utils/cronJobs.js";
import { isValidTimeFormat } from "../utils/timeformatValidation.js";
import moment from "moment";

export const createClass = async (req, res) => {
  try {
    const {
      className,
      classType = "regular",
      startTime,
      cutoffTime,
      selectedDays = [],
    } = req.body;
    const teacherId = req.user._id;

    // Validate inputs
    if (!className) {
      return res.status(400).json({ message: "Class name is required" });
    }
    if (!startTime || !isValidTimeFormat(startTime)) {
      return res.status(400).json({ message: "Valid startTime (HH:mm) is required" });
    }
    if (!cutoffTime || !isValidTimeFormat(cutoffTime)) {
      return res.status(400).json({ message: "Valid cutoffTime (HH:mm) is required" });
    }
    const start = moment(startTime, "HH:mm");
    const cutoff = moment(cutoffTime, "HH:mm");
    if (cutoff.isSameOrBefore(start)) {
      return res.status(400).json({ message: "cutoffTime must be after startTime" });
    }
    if (classType === "multi-weekly" && (!selectedDays || selectedDays.length === 0)) {
      return res.status(400).json({ message: "selectedDays is required for multi-weekly classes" });
    }
    if (selectedDays.some(day => day < 0 || day > 6)) {
      return res.status(400).json({ message: "selectedDays must be between 0 and 6" });
    }

    const newClass = new Conversation({
      // participants: [teacherId],
      group: {
        is_group: true,
        type: "classroom",
        name: className,
        classType,
        startTime,
        cutoffTime,
        selectedDays,
        admins: [teacherId],
        // moderators: [],
        // members: [teacherId],
        // fileSendingAllowed: false,
      },
      visibility: "private",
    });

    await newClass.save();
    await newClass.populate("group.admins", "name email image");
    await newClass.populate("participants", "name email image");
    scheduleSessionCronForClass(newClass);
    res.status(201).json({
      message: "Class created successfully",
      class: newClass,
    });
  } catch (error) {
    console.error("Error creating class:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

export const deleteClass = async (req, res) => {
  try {
    const classId = req.params.id;
    const deleted = await Conversation.findByIdAndDelete(classId);
    if (!deleted) {
      return res.status(404).json({ message: "Class not found" });
    }
    res.json({ message: "Class deleted successfully" });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Failed to delete class", error: error.message });
  }
};
// Add moderator to class
export const addModerator = async (req, res) => {
  try {
    const { id: classId } = req.params;
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ message: "User ID is required" });
    }

    const classGroup = req.classGroup;

    // Check if user is already a moderator
    if (classGroup.group.moderators.includes(userId)) {
      return res.status(400).json({ message: "User is already a moderator" });
    }

    // Check if user is a member of the class
    if (!classGroup.group.members.includes(userId)) {
      return res
        .status(400)
        .json({ message: "User must be a class member first" });
    }

    classGroup.group.moderators.push(userId);
    await classGroup.save();

    await classGroup.populate("group.moderators", "name email image");

    res.json({
      message: "Moderator added successfully",
      moderators: classGroup.group.moderators,
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Remove moderator from class
export const removeModerator = async (req, res) => {
  try {
    const { id: classId } = req.params;
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ message: "User ID is required" });
    }

    const classGroup = req.classGroup;

    // Check if user is a moderator
    if (!classGroup.group.moderators.includes(userId)) {
      return res.status(400).json({ message: "User is not a moderator" });
    }

    classGroup.group.moderators = classGroup.group.moderators.filter(
      (mod) => mod.toString() !== userId
    );
    await classGroup.save();

    await classGroup.populate("group.moderators", "name email image");

    res.json({
      message: "Moderator removed successfully",
      moderators: classGroup.group.moderators,
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Add member to class
export const addMember = async (req, res) => {
  try {
    const { id: classId } = req.params;
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ message: "User ID is required" });
    }

    const classGroup = req.classGroup;

    // Check if user is already a member
    if (classGroup.group.members.includes(userId)) {
      return res.status(400).json({ message: "User is already a member" });
    }

    // Check if user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    classGroup.group.members.push(userId);
    classGroup.participants.push(userId);
    await classGroup.save();

    // Auto-approve any pending join request
    await JoinRequest.findOneAndUpdate(
      { classId, userId, status: "pending" },
      { status: "approved", processedBy: req.user._id, processedAt: new Date() }
    );

    await classGroup.populate("group.members", "name email image");

    res.json({
      message: "Member added successfully",
      members: classGroup.group.members,
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Remove member from class
export const removeMember = async (req, res) => {
  try {
    const { id: classId } = req.params;
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ message: "User ID is required" });
    }

    const classGroup = req.classGroup;

    // Check if user is a member
    if (!classGroup.group.members.includes(userId)) {
      return res.status(400).json({ message: "User is not a member" });
    }

    // Cannot remove admin
    if (classGroup.group.admins.includes(userId)) {
      return res.status(400).json({ message: "Cannot remove class admin" });
    }

    classGroup.group.members = classGroup.group.members.filter(
      (member) => member.toString() !== userId
    );
    classGroup.participants = classGroup.participants.filter(
      (participant) => participant.toString() !== userId
    );

    // Also remove from moderators if they are one
    classGroup.group.moderators = classGroup.group.moderators.filter(
      (mod) => mod.toString() !== userId
    );

    await classGroup.save();

    await classGroup.populate("group.members", "name email image");

    res.json({
      message: "Member removed successfully",
      members: classGroup.group.members,
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Request to join class
export const requestJoinClass = async (req, res) => {
  try {
    const { id: classId } = req.params;
    const userId = req.user._id;

    // Check if class exists
    const classGroup = await Conversation.findById(classId);
    if (
      !classGroup ||
      !classGroup.group.is_group ||
      classGroup.group.type !== "classroom"
    ) {
      return res.status(404).json({ message: "Class not found" });
    }

    // Check if already a member
    if (classGroup.group.members.includes(userId)) {
      return res
        .status(400)
        .json({ message: "You are already a member of this class" });
    }

    // Check if request already exists
    const existingRequest = await JoinRequest.findOne({ classId, userId });
    if (existingRequest) {
      if (existingRequest.status === "pending") {
        return res
          .status(400)
          .json({ message: "Join request already pending" });
      }
      if (existingRequest.status === "approved") {
        return res
          .status(400)
          .json({ message: "Join request already approved" });
      }
    }

    // Create or update join request
    const joinRequest = await JoinRequest.findOneAndUpdate(
      { classId, userId },
      { status: "pending", requestedAt: new Date() },
      { upsert: true, new: true }
    );

    await joinRequest.populate("userId", "name email image");

    // Notify class admins
    classGroup.group.admins.forEach((adminId) => {
      req.io.to(adminId.toString()).emit("joinRequestReceived", {
        classId,
        request: joinRequest,
      });
    });

    res.json({
      message: "Join request sent successfully",
      request: joinRequest,
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Get pending join requests for a class
export const getJoinRequests = async (req, res) => {
  try {
    const { id: classId } = req.params;

    const requests = await JoinRequest.find({ classId, status: "pending" })
      .populate("userId", "name email image")
      .sort({ requestedAt: -1 });

    res.json({ requests });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Approve join request
export const approveJoinRequest = async (req, res) => {
  try {
    const { id: classId, userId } = req.params;

    const joinRequest = await JoinRequest.findOne({
      classId,
      userId,
      status: "pending",
    });
    if (!joinRequest) {
      return res.status(404).json({ message: "Join request not found" });
    }

    // Add user to class
    const classGroup = req.classGroup;
    classGroup.group.members.push(userId);
    classGroup.participants.push(userId);
    await classGroup.save();

    // Update join request
    joinRequest.status = "approved";
    joinRequest.processedBy = req.user._id;
    joinRequest.processedAt = new Date();
    await joinRequest.save();

    // Notify user
    req.io.to(userId).emit("joinRequestApproved", {
      classId,
      className: classGroup.group.name,
    });

    res.json({
      message: "Join request approved successfully",
      request: joinRequest,
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Reject join request
export const rejectJoinRequest = async (req, res) => {
  try {
    const { id: classId, userId } = req.params;

    const joinRequest = await JoinRequest.findOne({
      classId,
      userId,
      status: "pending",
    });
    if (!joinRequest) {
      return res.status(404).json({ message: "Join request not found" });
    }

    joinRequest.status = "rejected";
    joinRequest.processedBy = req.user._id;
    joinRequest.processedAt = new Date();
    await joinRequest.save();

    // Notify user
    req.io.to(userId).emit("joinRequestRejected", {
      classId,
      className: req.classGroup.group.name,
    });

    res.json({
      message: "Join request rejected",
      request: joinRequest,
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Update class settings
export const updateClassSettings = async (req, res) => {
  try {
    const { id: classId } = req.params;
    const updates = req.body;
    const classGroup = await Conversation.findByIdAndUpdate(
      classId,
      { $set: { "group.settings": updates } },
      { new: true }
    );
    if (!classGroup) {
      return res.status(404).json({ message: "Class not found" });
    }
    res.json({ message: "Class settings updated", class: classGroup });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Get class statistics
export const getClassStats = async (req, res) => {
  try {
    const { id: classId } = req.params;
    // Example: count members, moderators, assignments, etc.
    const classGroup = await Conversation.findById(classId);
    if (!classGroup) {
      return res.status(404).json({ message: "Class not found" });
    }
    const stats = {
      members: classGroup.group.members.length,
      moderators: classGroup.group.moderators.length,
      admins: classGroup.group.admins.length,
      // Add more stats as needed
    };
    res.json({ stats });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Get class members
export const getClassMembers = async (req, res) => {
  try {
    const { id: classId } = req.params;
    const classGroup = await Conversation.findById(classId).populate(
      "group.members",
      "name email image"
    );
    if (!classGroup) {
      return res.status(404).json({ message: "Class not found" });
    }
    res.json({ members: classGroup.group.members });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Leave class
export const leaveClass = async (req, res) => {
  try {
    const { id: classId } = req.params;
    const userId = req.user._id;
    const classGroup = await Conversation.findById(classId);
    if (!classGroup) {
      return res.status(404).json({ message: "Class not found" });
    }
    // Remove user from members and participants
    classGroup.group.members = classGroup.group.members.filter(
      (member) => member.toString() !== userId.toString()
    );
    classGroup.participants = classGroup.participants.filter(
      (participant) => participant.toString() !== userId.toString()
    );
    // Remove from moderators if present
    classGroup.group.moderators = classGroup.group.moderators.filter(
      (mod) => mod.toString() !== userId.toString()
    );
    await classGroup.save();
    res.json({ message: "Left class successfully" });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Get all classes for a user
export const getUserClasses = async (req, res) => {
  try {
    const userId = req.user._id;
    const classes = await Conversation.find({
      "group.is_group": true,
      "group.type": "classroom",
      "group.members": userId,
    }).populate("group.admins", "name email image");
    res.json({ classes });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};
// Log attendance when user enters class
export const logAttendance = async (req, res) => {
  try {
    const { id: classId } = req.params;
    const userId = req.user._id;

    // Check if user is a member of the class
    const classGroup = await Conversation.findById(classId);
    if (!classGroup || !classGroup.group.members.includes(userId)) {
      return res.status(403).json({ message: "Access denied" });
    }

    const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

    // Check if already logged for today
    let attendanceLog = await AttendanceLog.findOne({
      classId,
      userId,
      sessionDate: today,
    });

    if (!attendanceLog) {
      attendanceLog = new AttendanceLog({
        classId,
        userId,
        sessionDate: today,
        enteredAt: new Date(),
      });
      await attendanceLog.save();
    } else {
      // Update entry time if re-entering
      attendanceLog.enteredAt = new Date();
      attendanceLog.leftAt = null;
      await attendanceLog.save();
    }

    res.json({
      message: "Attendance logged successfully",
      attendance: attendanceLog,
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Start alertness check session
export const startAlertnessSession = async (req, res) => {
  try {
    const { id: classId } = req.params;
    const { duration = 30000 } = req.body; // Default 30 seconds

    const classGroup = req.classGroup;

    // Check if there's already an active session
    const activeSession = await AlertnessSession.findOne({
      classId,
      isActive: true,
    });
    if (activeSession) {
      return res
        .status(400)
        .json({ message: "An alertness session is already active" });
    }

    const session = new AlertnessSession({
      classId,
      startedBy: req.user._id,
      duration,
      totalParticipants: classGroup.group.members.length,
    });

    await session.save();

    // Set auto-end timer
    setTimeout(async () => {
      const sessionToEnd = await AlertnessSession.findById(session._id);
      if (sessionToEnd && sessionToEnd.isActive) {
        sessionToEnd.isActive = false;
        sessionToEnd.endTime = new Date();
        sessionToEnd.responseRate =
          (sessionToEnd.responses.length / sessionToEnd.totalParticipants) *
          100;
        await sessionToEnd.save();

        // Notify class about session end
        req.io.to(classId).emit("alertnessSessionEnded", {
          sessionId: session._id,
          responseRate: sessionToEnd.responseRate,
        });
      }
    }, duration);

    // Notify all class members
    req.io.to(classId).emit("alertnessSessionStarted", {
      sessionId: session._id,
      duration,
      startedBy: req.user.name,
    });

    res.json({
      message: "Alertness session started",
      session,
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Respond to alertness check
export const respondToAlertnessCheck = async (req, res) => {
  try {
    const { id: classId } = req.params;
    const userId = req.user._id;

    const session = await AlertnessSession.findOne({ classId, isActive: true });
    if (!session) {
      return res
        .status(404)
        .json({ message: "No active alertness session found" });
    }

    // Check if user already responded
    const existingResponse = session.responses.find(
      (r) => r.userId.toString() === userId.toString()
    );
    if (existingResponse) {
      return res
        .status(400)
        .json({ message: "You have already responded to this session" });
    }

    const responseTime = Date.now() - session.startTime.getTime();

    session.responses.push({
      userId,
      responseTime,
    });

    await session.save();

    res.json({
      message: "Response recorded successfully",
      responseTime,
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Submit assignment
export const submitAssignment = async (req, res) => {
  try {
    const { id: classId } = req.params;
    const { assignmentTitle, file } = req.body;
    const userId = req.user._id;

    if (!assignmentTitle || !file) {
      return res
        .status(400)
        .json({ message: "Assignment title and file are required" });
    }

    // Check if user is a member of the class
    const classGroup = await Conversation.findById(classId);
    if (!classGroup || !classGroup.group.members.includes(userId)) {
      return res.status(403).json({ message: "Access denied" });
    }

    const submission = new AssignmentSubmission({
      classId,
      userId,
      assignmentTitle,
      file,
    });

    await submission.save();
    await submission.populate("userId", "name email image");

    // Notify class admins
    classGroup.group.admins.forEach((adminId) => {
      req.io.to(adminId.toString()).emit("assignmentSubmitted", {
        classId,
        submission,
      });
    });

    res.json({
      message: "Assignment submitted successfully",
      submission,
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Mark assignment
export const markAssignment = async (req, res) => {
  try {
    const { submissionId } = req.params;
    const { mark, feedback } = req.body;

    if (mark === undefined || mark < 0 || mark > 100) {
      return res
        .status(400)
        .json({ message: "Valid mark (0-100) is required" });
    }

    const submission = await AssignmentSubmission.findById(submissionId);
    if (!submission) {
      return res.status(404).json({ message: "Submission not found" });
    }

    // Check if user is admin of the class
    const classGroup = await Conversation.findById(submission.classId);
    if (!classGroup.group.admins.includes(req.user._id)) {
      return res.status(403).json({ message: "Access denied" });
    }

    submission.mark = mark;
    submission.feedback = feedback;
    submission.markedBy = req.user._id;
    submission.markedAt = new Date();

    await submission.save();
    await submission.populate(["userId", "markedBy"], "name email image");

    // Notify student
    req.io.to(submission.userId._id.toString()).emit("assignmentMarked", {
      submissionId,
      mark,
      feedback,
    });

    res.json({
      message: "Assignment marked successfully",
      submission,
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Get class details
export const getClassDetails = async (req, res) => {
  try {
    const { id: classId } = req.params;

    const classGroup = await Conversation.findById(classId)
      .populate("group.admins", "name email image")
      .populate("group.moderators", "name email image")
      .populate("group.members", "name email image");

    if (
      !classGroup ||
      !classGroup.group.is_group ||
      classGroup.group.type !== "classroom"
    ) {
      return res.status(404).json({ message: "Class not found" });
    }

    res.json({ class: classGroup });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};
// Update class details (name, image, etc.)
export const updateClass = async (req, res) => {
  try {
    const { id: classId } = req.params;
    const updates = req.body;
    const classGroup = await Conversation.findByIdAndUpdate(
      classId,
      {
        $set: {
          "group.name": updates.name,
          "group.image": updates.image,
          "group.classType": updates.classType,
          // Add more fields as needed
        },
      },
      { new: true }
    )
      .populate("group.admins", "name email image")
      .populate("group.moderators", "name email image")
      .populate("group.members", "name email image");

    if (!classGroup) {
      return res.status(404).json({ message: "Class not found" });
    }
    res.json({ message: "Class updated successfully", class: classGroup });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};
