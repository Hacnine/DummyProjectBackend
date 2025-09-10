import Conversation from "../models/conversationModel.js";
import JoinRequest from "../models/joinRequestModel.js";
import AssignmentSubmission from "../models/assignmentSubmissionModel.js";
import AttendanceLog from "../models/attendanceLogModel.js";
import AlertnessSession from "../models/alertnessSessionModel.js";
import User from "../models/userModel.js";
import { isValidTimeFormat } from "../utils/timeformatValidation.js";
import moment from "moment";
import mongoose from "mongoose";
import { scheduleSessionCronForClass } from "../schedulers/sessionCreationJob.js";
import { incrementUnreadRequest } from "../utils/controller-utils/unreadCountUtils.js";
import { incrementUnreadRequestAndEmit } from "../sockets/conversationSocket.js";
import { io } from "../app.js";

export const createClass = async (req, res) => {
  try {
    const {
      className,
      classType = "regular",
      startTime,
      cutoffTime,
      selectedDays = [],
      visibility = "public",
    } = req.body;
    const teacherId = req.user._id;

    // Validate inputs
    if (!className) {
      return res.status(400).json({ message: "Class name is required" });
    }
    if (!startTime || !isValidTimeFormat(startTime)) {
      return res
        .status(400)
        .json({ message: "Valid startTime (HH:mm) is required" });
    }
    if (!cutoffTime || !isValidTimeFormat(cutoffTime)) {
      return res
        .status(400)
        .json({ message: "Valid cutoffTime (HH:mm) is required" });
    }
    const start = moment(startTime, "HH:mm");
    const cutoff = moment(cutoffTime, "HH:mm");
    if (cutoff.isSameOrBefore(start)) {
      return res
        .status(400)
        .json({ message: "cutoffTime must be after startTime" });
    }
    if (
      classType === "multi-weekly" &&
      (!selectedDays || selectedDays.length === 0)
    ) {
      return res
        .status(400)
        .json({ message: "selectedDays is required for multi-weekly classes" });
    }
    if (selectedDays.some((day) => day < 0 || day > 6)) {
      return res
        .status(400)
        .json({ message: "selectedDays must be between 0 and 6" });
    }

    const newClass = new Conversation({
      participants: [teacherId],
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
        // fileSendingAllowed: false,
      },
      visibility: visibility,
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
    const classId = req.params.classId;
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
    const { classId } = req.params;
    const { userId } = req.body;

    // Validate inputs
    if (!userId || !mongoose.isValidObjectId(userId)) {
      return res.status(400).json({ message: "Valid User ID is required" });
    }

    const classGroup = req.classGroup;

    // Check if user is already a moderator
    if (classGroup.group.moderators.some((mod) => mod.toString() === userId)) {
      return res.status(400).json({ message: "User is already a moderator" });
    }

    // Check if user is a participant of the class
    if (
      !classGroup.participants.some(
        (participant) => participant.toString() === userId
      )
    ) {
      return res
        .status(400)
        .json({ message: "User must be a class participant first" });
    }

    classGroup.group.moderators.push(userId);
    await classGroup.save();

    await classGroup.populate("group.moderators", "name email image");

    res.json({
      message: "Moderator added successfully",
      moderators: classGroup.group.moderators,
    });
  } catch (error) {
    console.error("Error adding moderator:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

export const removeModerator = async (req, res) => {
  try {
    const { classId } = req.params;
    const { userId } = req.body;

    // Validate inputs
    if (!userId || !mongoose.isValidObjectId(userId)) {
      return res.status(400).json({ message: "Valid User ID is required" });
    }

    const classGroup = req.classGroup;

    // Check if user is a moderator
    if (!classGroup.group.moderators.some((mod) => mod.toString() === userId)) {
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
    console.error("Error removing moderator:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

export const addMember = async (req, res) => {
  try {
    const { classId } = req.params;
    const { userId } = req.body;

    // Validate inputs
    if (!userId || !mongoose.isValidObjectId(userId)) {
      return res.status(400).json({ message: "Valid User ID is required" });
    }

    const classGroup = req.classGroup;

    // Check if user is already a participant
    if (
      classGroup.participants.some(
        (participant) => participant.toString() === userId
      )
    ) {
      return res.status(400).json({ message: "User is already a participant" });
    }

    // Check if user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    classGroup.participants.push(userId);
    await classGroup.save();

    // Auto-approve any pending join request
    await JoinRequest.findOneAndUpdate(
      { classId, userId, status: "pending" },
      { status: "approved", processedBy: req.user._id, processedAt: new Date() }
    );

    await classGroup.populate("participants", "name email image");

    res.json({
      message: "Member added successfully",
      participants: classGroup.participants,
    });
  } catch (error) {
    console.error("Error adding member:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

export const removeMember = async (req, res) => {
  try {
    const { classId } = req.params;
    const { userId } = req.body;

    // Validate inputs
    if (!userId || !mongoose.isValidObjectId(userId)) {
      return res.status(400).json({ message: "Valid User ID is required" });
    }

    const classGroup = req.classGroup;

    // Check if user is a participant
    if (
      !classGroup.participants.some(
        (participant) => participant.toString() === userId
      )
    ) {
      return res.status(400).json({ message: "User is not a participant" });
    }

    // Cannot remove admin
    if (classGroup.group.admins.some((admin) => admin.toString() === userId)) {
      return res.status(400).json({ message: "Cannot remove class admin" });
    }

    classGroup.participants = classGroup.participants.filter(
      (participant) => participant.toString() !== userId
    );

    // Also remove from moderators if they are one
    classGroup.group.moderators = classGroup.group.moderators.filter(
      (mod) => mod.toString() !== userId
    );

    await classGroup.save();

    await classGroup.populate("participants", "name email image");

    res.json({
      message: "Member removed successfully",
      participants: classGroup.participants,
    });
  } catch (error) {
    console.error("Error removing member:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

export const requestJoinClass = async (req, res) => {
  try {
    const { classId } = req.params;
    const userId = req.user._id;

    // Validate classId
    if (!mongoose.isValidObjectId(classId)) {
      return res.status(400).json({ message: "Valid Class ID is required" });
    }

    // Check if class exists
    const conversation = await Conversation.findById(classId);
    if (!conversation || !conversation.group.is_group) {
      return res.status(404).json({ message: "Class not found" });
    }

    // Check if already a participant
    if (
      conversation.participants.some(
        (participant) => participant.toString() === userId
      )
    ) {
      return res
        .status(400)
        .json({ message: "You are already a participant of this class" });
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

    // Notify class admins (commented out as in original)
    // conversation.group.admins.forEach((adminId) => {
    //   req.io.to(adminId.toString()).emit("joinRequestReceived", {
    //     classId,
    //     request: joinRequest,
    //   });
    // });

    //  Increment unreadFriendRequestCount for all admins
    if (conversation.group.admins?.length > 0) {
      await Promise.all(
        conversation.group.admins.map((adminId) =>
          incrementUnreadRequestAndEmit(io, adminId, conversation.group.type)
        )
      );
    }

    res.json({
      message: "Join request sent successfully",
      request: joinRequest,
    });
  } catch (error) {
    console.error("Error requesting to join class:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

export const getJoinRequests = async (req, res) => {
  try {
    const { classId } = req.params;

    // Validate classId
    if (!mongoose.isValidObjectId(classId)) {
      return res.status(400).json({ message: "Valid Class ID is required" });
    }

    const requests = await JoinRequest.find({ classId, status: "pending" })
      .populate("userId", "name email image")
      .sort({ requestedAt: -1 });

    res.json({ requests });
  } catch (error) {
    console.error("Error fetching join requests:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

export const approveJoinRequest = async (req, res) => {
  try {
    const { classId, userId } = req.params;
    // Validate inputs
    if (
      !mongoose.isValidObjectId(classId) ||
      !mongoose.isValidObjectId(userId)
    ) {
      return res
        .status(400)
        .json({ message: "Valid Class ID and User ID are required" });
    }

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
    if (
      classGroup.participants.some(
        (participant) => participant.toString() === userId
      )
    ) {
      return res.status(400).json({ message: "User is already a participant" });
    }

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

    await classGroup.populate("participants", "name email image");

    res.json({
      message: "Join request approved successfully",
      request: joinRequest,
      participants: classGroup.participants,
    });

    await JoinRequest.deleteOne({ _id: joinRequest._id });
  } catch (error) {
    console.error("Error approving join request:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

export const rejectJoinRequest = async (req, res) => {
  try {
    const { classId, userId } = req.params;

    // Validate inputs
    if (
      !mongoose.isValidObjectId(classId) ||
      !mongoose.isValidObjectId(userId)
    ) {
      return res
        .status(400)
        .json({ message: "Valid Class ID and User ID are required" });
    }

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
    await JoinRequest.deleteOne({ _id: joinRequest._id });
  } catch (error) {
    console.error("Error rejecting join request:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

export const updateClassSettings = async (req, res) => {
  try {
    const { classId } = req.params;
    const updates = req.body;

    // Validate classId
    if (!mongoose.isValidObjectId(classId)) {
      return res.status(400).json({ message: "Valid Class ID is required" });
    }

    // Validate updates (basic example, adjust based on your schema)
    const allowedFields = [
      "classType",
      "fileSendingAllowed",
      "startTime",
      "cutoffTime",
      "checkInterval",
      "selectedDays",
    ];
    const updateKeys = Object.keys(updates);
    if (
      updateKeys.length === 0 ||
      !updateKeys.every((key) => allowedFields.includes(key))
    ) {
      return res.status(400).json({ message: "Invalid settings provided" });
    }

    const classGroup = await Conversation.findByIdAndUpdate(
      classId,
      { $set: { group: { ...req.classGroup.group, ...updates } } },
      { new: true }
    );
    if (!classGroup) {
      return res.status(404).json({ message: "Class not found" });
    }

    res.json({ message: "Class settings updated", class: classGroup });
  } catch (error) {
    console.error("Error updating class settings:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

export const getClassStats = async (req, res) => {
  try {
    const { classId } = req.params;

    // Validate classId
    if (!mongoose.isValidObjectId(classId)) {
      return res.status(400).json({ message: "Valid Class ID is required" });
    }

    const classGroup = await Conversation.findById(classId);
    if (!classGroup) {
      return res.status(404).json({ message: "Class not found" });
    }

    const stats = {
      participants: classGroup.participants.length, // Updated from members
      moderators: classGroup.group.moderators.length,
      admins: classGroup.group.admins.length,
      // Add more stats as needed
    };

    res.json({ stats });
  } catch (error) {
    console.error("Error fetching class stats:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

export const getClassMembers = async (req, res) => {
  try {
    const { classId } = req.params;

    // Validate classId
    if (!mongoose.isValidObjectId(classId)) {
      return res.status(400).json({ message: "Valid Class ID is required" });
    }

    const classGroup = await Conversation.findById(classId).populate(
      "participants",
      "name email image"
    );
    if (!classGroup) {
      return res.status(404).json({ message: "Class not found" });
    }

    res.json({ participants: classGroup.participants });
  } catch (error) {
    console.error("Error fetching class members:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

export const leaveClass = async (req, res) => {
  try {
    const { classId } = req.params;
    const userId = req.user._id;

    // Validate classId
    if (!mongoose.isValidObjectId(classId)) {
      return res.status(400).json({ message: "Valid Class ID is required" });
    }

    const classGroup = await Conversation.findById(classId);
    if (!classGroup) {
      return res.status(404).json({ message: "Class not found" });
    }

    // Check if user is a participant
    if (
      !classGroup.participants.some(
        (participant) => participant.toString() === userId.toString()
      )
    ) {
      return res
        .status(400)
        .json({ message: "User is not a participant of this class" });
    }

    // Prevent admin from leaving (optional, adjust based on requirements)
    if (
      classGroup.group.admins.some(
        (admin) => admin.toString() === userId.toString()
      )
    ) {
      return res.status(400).json({ message: "Admins cannot leave the class" });
    }

    // Remove user from participants
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
    console.error("Error leaving class:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const escapeRegex = (string) => {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

export const searchClasses = async (req, res) => {
  try {
    const { query, page = 1, limit = 10 } = req.query;
    const currentUserId = req.user._id;

    // Validate query parameter
    if (!query) {
      return res.status(400).json({ error: "Query parameter is required" });
    }

    if (!query.match(/^[a-zA-Z0-9._%+-@ ]*$/)) {
      return res.status(400).json({ error: "Invalid query characters" });
    }

    // Validate pagination parameters
    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);

    if (pageNum < 1 || limitNum < 1) {
      return res
        .status(400)
        .json({ error: "Page and limit must be positive integers" });
    }

    const escapedQuery = escapeRegex(query);
    let searchCriteria = [];

    // Search for public class conversations by name
    searchCriteria.push({
      "group.name": { $regex: escapedQuery, $options: "i" },
      "group.is_group": true,
      "group.type": "classroom",
      visibility: "public",
      participants: { $nin: [currentUserId] },
    });

    // // Search for public conversations by participant names/emails
    // const users = await User.find({
    //   $or: [
    //     { name: { $regex: escapedQuery, $options: "i" } },
    //     { email: { $regex: escapedQuery, $options: "i" } },
    //   ],
    // }).select("_id");

    // if (users.length > 0) {
    //   const userIds = users
    //     .map((user) => user._id)
    //     .filter((id) => mongoose.isValidObjectId(id));
    //   if (userIds.length > 0) {
    //     searchCriteria.push({
    //       participants: { $in: userIds },
    //       "group.is_group": true,
    //       "group.type": "classroom",
    //       visibility: "public",
    //       participants: { $nin: [currentUserId] },
    //     });
    //   }
    // }

    const finalCriteria =
      searchCriteria.length > 0 ? { $or: searchCriteria } : {};

    const total = await Conversation.countDocuments(finalCriteria);

    const conversations = await Conversation.find(finalCriteria)
      .select("group.name group.image group.type participants")
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .lean();

    if (!conversations.length) {
      return res.status(200).json({
        conversations: [],
        total: 0,
        page: pageNum,
        totalPages: 0,
      });
    }

    // Fetch pending join requests for the current user
    const conversationIds = conversations.map((conv) => conv._id);
    const pendingRequests = await JoinRequest.find({
      userId: currentUserId,
      classId: { $in: conversationIds },
      status: "pending",
    })
      .select("classId")
      .lean();

    // Use Set for O(1) lookup of pending request classIds
    const pendingRequestIds = new Set(
      pendingRequests.map((req) => req.classId.toString())
    );

    const formattedConversations = conversations.map((conv) => ({
      _id: conv._id.toString(),
      name: conv.group?.name || "Unnamed Class",
      image: conv.group?.image || null,
      groupType: conv.group?.type || "classroom",
      participantCount: conv.participants?.length || 0,
      hasPendingRequest: pendingRequestIds.has(conv._id.toString()),
    }));

    res.status(200).json({
      conversations: formattedConversations,
      total,
      page: pageNum,
      totalPages: Math.ceil(total / limitNum),
    });
  } catch (error) {
    console.error("Error searching classes:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const getUserClasses = async (req, res) => {
  try {
    const userId = req.user._id;

    // Validate userId
    if (!mongoose.isValidObjectId(userId)) {
      return res.status(400).json({ message: "Valid User ID is required" });
    }

    const classes = await Conversation.find({
      "group.is_group": true,
      "group.type": "classroom",
      participants: userId, // Updated from group.members
    }).populate("group.admins", "name email image");

    res.json({ classes });
  } catch (error) {
    console.error("Error fetching user classes:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

export const logAttendance = async (req, res) => {
  try {
    const { id: classId } = req.params;
    const userId = req.user._id;

    // Validate inputs
    if (
      !mongoose.isValidObjectId(classId) ||
      !mongoose.isValidObjectId(userId)
    ) {
      return res
        .status(400)
        .json({ message: "Valid Class ID and User ID are required" });
    }

    // Check if user is a participant of the class
    const classGroup = await Conversation.findById(classId);
    if (
      !classGroup ||
      !classGroup.participants.some(
        (participant) => participant.toString() === userId.toString()
      )
    ) {
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
    console.error("Error logging attendance:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

export const startAlertnessSession = async (req, res) => {
  try {
    const { id: classId } = req.params;
    const { duration = 30000 } = req.body; // Default 30 seconds

    // Validate inputs
    if (!mongoose.isValidObjectId(classId)) {
      return res.status(400).json({ message: "Valid Class ID is required" });
    }

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
      totalParticipants: classGroup.participants.length, // Updated from group.members
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

    // Notify all class participants
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
    console.error("Error starting alertness session:", error);
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

    // Validate inputs
    if (!mongoose.isValidObjectId(classId)) {
      return res.status(400).json({ message: "Valid Class ID is required" });
    }
    if (!assignmentTitle || !file) {
      return res
        .status(400)
        .json({ message: "Assignment title and file are required" });
    }

    // Check if user is a participant of the class
    const classGroup = await Conversation.findById(classId);
    if (
      !classGroup ||
      !classGroup.participants.some(
        (participant) => participant.toString() === userId.toString()
      )
    ) {
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
    console.error("Error submitting assignment:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

export const markAssignment = async (req, res) => {
  try {
    const { submissionId } = req.params;
    const { mark, feedback } = req.body;

    // Validate inputs
    if (!mongoose.isValidObjectId(submissionId)) {
      return res
        .status(400)
        .json({ message: "Valid Submission ID is required" });
    }
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
    if (
      !classGroup ||
      !classGroup.group.admins.some(
        (admin) => admin.toString() === req.user._id.toString()
      )
    ) {
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
    console.error("Error marking assignment:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

export const getClassDetails = async (req, res) => {
  try {
    const { classId } = req.params;

    // Validate classId
    if (!mongoose.isValidObjectId(classId)) {
      return res.status(400).json({ message: "Valid Class ID is required" });
    }

    const classGroup = await Conversation.findById(classId)
      .populate("group.admins", "name email image")
      .populate("group.moderators", "name email image")
      .populate("participants", "name email image"); // Updated from group.members

    if (
      !classGroup ||
      !classGroup.group.is_group ||
      classGroup.group.type !== "classroom"
    ) {
      return res.status(404).json({ message: "Class not found" });
    }

    res.json({ class: classGroup });
  } catch (error) {
    console.error("Error fetching class details:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

export const updateClass = async (req, res) => {
  try {
    const { classId } = req.params;
    const updates = req.body;

    // Validate classId
    if (!mongoose.isValidObjectId(classId)) {
      return res.status(400).json({ message: "Valid Class ID is required" });
    }

    // Validate updates
    const allowedFields = [
      "name",
      "image",
      "classType",
      "fileSendingAllowed",
      "startTime",
      "cutoffTime",
      "checkInterval",
      "selectedDays",
    ];
    const updateKeys = Object.keys(updates);
    if (
      updateKeys.length === 0 ||
      !updateKeys.every((key) => allowedFields.includes(key))
    ) {
      return res
        .status(400)
        .json({ message: "Invalid update fields provided" });
    }

    const classGroup = await Conversation.findByIdAndUpdate(
      classId,
      {
        $set: {
          group: {
            ...req.classGroup.group, // Preserve existing group fields
            ...updates, // Apply updates
          },
        },
      },
      { new: true }
    )
      .populate("group.admins", "name email image")
      .populate("group.moderators", "name email image")
      .populate("participants", "name email image"); // Updated from group.members

    if (!classGroup) {
      return res.status(404).json({ message: "Class not found" });
    }

    res.json({ message: "Class updated successfully", class: classGroup });
  } catch (error) {
    console.error("Error updating class:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

export const getClassJoinRequests = async (req, res) => {
  try {
    const userId = req.user._id;

    // Validate userId
    if (!mongoose.isValidObjectId(userId)) {
      return res.status(400).json({ message: "Valid User ID is required" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    let query = {};
    let isRequester = false;

    // Check if user is a teacher/admin or the requester
    if (user.role === "teacher") {
      const classes = await Conversation.find({
        "group.type": "classroom",
        $or: [{ "group.admins": userId }, { "group.moderators": userId }],
      }).select("_id group.name group.classType");
      query = {
        classId: { $in: classes.map((c) => c._id) },
        status: "pending",
      };
    } else {
      // Non-teachers can only see their own pending join requests
      query = { userId, status: "pending" };
      isRequester = true;
    }

    // Find join requests based on the query
    const requests = await JoinRequest.find(query)
      .populate("userId", "name image")
      .populate("classId", "group.name group.classType")
      .sort({ requestedAt: -1 });

    // If the user is the requester, return only conversation name, date, and image
    if (isRequester) {
      const simplifiedRequests = requests.map((request) => ({
        conversationName: request.classId.group.name,
        date: request.requestedAt,
        image: request.userId.image,
      }));

      // Pagination for simplified requests
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const skip = (page - 1) * limit;
      const paginatedRequests = simplifiedRequests.slice(skip, skip + limit);

      return res.json({
        requests: paginatedRequests,
        totalRequests: simplifiedRequests.length,
        page,
        limit,
      });
    }

    // For teachers/admins, group requests by class (original logic)
    const classMap = {};
    requests.forEach((request) => {
      const classId = request.classId._id.toString();
      if (!classMap[classId]) {
        classMap[classId] = {
          classId: request.classId._id,
          className: request.classId.group.name,
          classType: request.classId.group.classType,
          requests: [],
        };
      }
      classMap[classId].requests.push({
        _id: request._id,
        user: {
          _id: request.userId._id,
          name: request.userId.name,
          image: request.userId.image,
        },
        status: request.status,
        requestedAt: request.requestedAt,
      });
    });

    // Convert classMap to array and sort by latest request date
    let groupedRequests = Object.values(classMap);
    groupedRequests.sort((a, b) => {
      const aLatest = a.requests[0]?.requestedAt || new Date(0);
      const bLatest = b.requests[0]?.requestedAt || new Date(0);
      return new Date(bLatest) - new Date(aLatest);
    });

    // Flatten requests for pagination
    const flattenedRequests = [];
    groupedRequests.forEach((classItem) => {
      classItem.requests.forEach((request) => {
        flattenedRequests.push({
          classId: classItem.classId,
          className: classItem.className,
          classType: classItem.classType,
          request,
        });
      });
    });

    // Pagination based on requests
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const paginatedFlattenedRequests = flattenedRequests.slice(skip, skip + limit);

    // Re-group requests by class
    const result = [];
    const seenClassIds = new Set();
    paginatedFlattenedRequests.forEach(({ classId, className, classType, request }) => {
      const classIdStr = classId.toString();
      if (!seenClassIds.has(classIdStr)) {
        seenClassIds.add(classIdStr);
        result.push({
          classId,
          className,
          classType,
          requests: [],
        });
      }
      const classItem = result.find((item) => item.classId.toString() === classIdStr);
      classItem.requests.push(request);
    });

    res.json({
      classes: result,
      totalRequests: flattenedRequests.length,
      page,
      limit,
    });
  } catch (error) {
    console.error("Error fetching class join requests:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};
