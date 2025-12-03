import mongoose from "mongoose";
import Report from "../models/reportModel.js";
import Conversation from "../models/conversationModel.js";

// Valid report reasons
const VALID_REASONS = [
  "spam",
  "harassment",
  "hate_speech",
  "violence",
  "nudity",
  "false_info",
  "impersonation",
  "other",
];

// Submit a report for a conversation
export const reportConversation = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { reason, details } = req.body;
    const reporterId = req.user._id;

    // Validate conversation ID
    if (!conversationId || !mongoose.isValidObjectId(conversationId)) {
      return res.status(400).json({ message: "Invalid conversation ID." });
    }

    // Validate reason
    if (!reason || !VALID_REASONS.includes(reason)) {
      return res.status(400).json({
        message: "Invalid report reason.",
        validReasons: VALID_REASONS,
      });
    }

    // Find conversation
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found." });
    }

    // Check if reporter is a participant
    const isParticipant = conversation.participants.some(
      (p) => p.toString() === reporterId.toString()
    );
    if (!isParticipant) {
      return res
        .status(403)
        .json({ message: "You are not a participant in this conversation." });
    }

    // Get the reported user (the other participant)
    const reportedUserId = conversation.participants.find(
      (p) => p.toString() !== reporterId.toString()
    );

    if (!reportedUserId) {
      return res.status(400).json({ message: "Cannot determine reported user." });
    }

    // Check for existing recent report (within 24 hours)
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const existingReport = await Report.findOne({
      reporter: reporterId,
      conversation: conversationId,
      createdAt: { $gte: twentyFourHoursAgo },
    });

    if (existingReport) {
      return res.status(429).json({
        message: "You have already reported this conversation recently. Please wait before submitting another report.",
      });
    }

    // Create the report
    const report = await Report.create({
      reporter: reporterId,
      reportedUser: reportedUserId,
      conversation: conversationId,
      reason,
      details: details?.trim() || "",
    });

    res.status(201).json({
      message: "Report submitted successfully.",
      reportId: report._id,
    });
  } catch (error) {
    console.error("Error submitting report:", error);
    res.status(500).json({ message: "Server error." });
  }
};

// Get reports for admin (paginated)
export const getReports = async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);

    const query = {};
    if (status && ["pending", "reviewed", "resolved", "dismissed"].includes(status)) {
      query.status = status;
    }

    const reports = await Report.find(query)
      .populate("reporter", "name email image")
      .populate("reportedUser", "name email image")
      .populate("conversation", "group.name")
      .populate("reviewedBy", "name email")
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum);

    const totalReports = await Report.countDocuments(query);

    res.status(200).json({
      reports,
      totalReports,
      totalPages: Math.ceil(totalReports / limitNum),
      currentPage: pageNum,
    });
  } catch (error) {
    console.error("Error fetching reports:", error);
    res.status(500).json({ message: "Server error." });
  }
};

// Update report status (admin only)
export const updateReportStatus = async (req, res) => {
  try {
    const { reportId } = req.params;
    const { status, resolution, actionTaken } = req.body;
    const adminId = req.user._id;

    if (!reportId || !mongoose.isValidObjectId(reportId)) {
      return res.status(400).json({ message: "Invalid report ID." });
    }

    if (!status || !["pending", "reviewed", "resolved", "dismissed"].includes(status)) {
      return res.status(400).json({ message: "Invalid status." });
    }

    const report = await Report.findById(reportId);
    if (!report) {
      return res.status(404).json({ message: "Report not found." });
    }

    report.status = status;
    report.reviewedBy = adminId;
    report.reviewedAt = new Date();

    if (resolution) {
      report.resolution = resolution.trim();
    }

    if (actionTaken && ["none", "warning", "temporary_ban", "permanent_ban", "content_removed"].includes(actionTaken)) {
      report.actionTaken = actionTaken;
    }

    await report.save();

    res.status(200).json({
      message: "Report updated successfully.",
      report,
    });
  } catch (error) {
    console.error("Error updating report:", error);
    res.status(500).json({ message: "Server error." });
  }
};

// Get report statistics (admin)
export const getReportStats = async (req, res) => {
  try {
    const stats = await Report.aggregate([
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
    ]);

    const reasonStats = await Report.aggregate([
      {
        $group: {
          _id: "$reason",
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
    ]);

    const formattedStats = {
      byStatus: {},
      byReason: {},
      total: 0,
    };

    stats.forEach((s) => {
      formattedStats.byStatus[s._id] = s.count;
      formattedStats.total += s.count;
    });

    reasonStats.forEach((r) => {
      formattedStats.byReason[r._id] = r.count;
    });

    res.status(200).json(formattedStats);
  } catch (error) {
    console.error("Error fetching report stats:", error);
    res.status(500).json({ message: "Server error." });
  }
};
