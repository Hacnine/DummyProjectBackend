import Session from "../models/sessionModel.js";
import AttendanceLog from "../models/attendanceLogModel.js";
import Conversation from "../models/conversationModel.js";
import moment from "moment";

// Create manual session
export const createManualSession = async (req, res) => {
  try {
    const { date, startTime, cutoffTime, duration } = req.body;
    const createdBy = req.user._id;
    const { classId } = req.params;
    const classGroup = await Conversation.findById(classId);
    if (!classGroup || !classGroup.group.admins.includes(createdBy)) {
      return res.status(403).json({ message: "Access denied" });
    }

    // Use provided cutoffTime or default to startTime + 15 minutes
    const finalCutoffTime = cutoffTime
      ? moment(cutoffTime, "HH:mm").format("HH:mm")
      : moment(startTime, "HH:mm").add(15, "minutes").format("HH:mm");

    const session = new Session({
      classId,
      date,
      startTime,
      type: "manual",
      createdBy,
      duration,
      cutoffTime: finalCutoffTime,
    });

    await session.save();
    res.json({ message: "Session created successfully", session });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Auto-generate sessions
export const autoGenerateSessions = async (req, res) => {
  try {
    const today = moment().format("YYYY-MM-DD");
    const classes = await Conversation.find({ "group.type": "classroom" });

    for (const classGroup of classes) {
      if (classGroup.classType === "regular") {
        const session = new Session({
          classId: classGroup._id,
          date: today,
          startTime: "09:00", // Default start time
          cutoffTime: "09:15",
        });
        await session.save();
      } else if (classGroup.classType === "multi-weekly") {
        const selectedDays = classGroup.group.selectedDays || []; // Assume selectedDays stored in group
        const todayDay = moment().day();
        if (selectedDays.includes(todayDay)) {
          const session = new Session({
            classId: classGroup._id,
            date: today,
            startTime: "09:00",
            cutoffTime: "09:15",
          });
          await session.save();
        }
      }
    }

    res.json({ message: "Auto-generated sessions successfully" });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Get sessions
export const getSessions = async (req, res) => {
  try {
    const { classId, date } = req.query;
    const filter = { classId };
    if (date) filter.date = date;

    const sessions = await Session.find(filter)
      .populate("classId", "group.name")
      .sort({ date: -1, startTime: -1 });

    res.json({ sessions });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Mark attendance
export const markAttendance = async (req, res) => {
  try {
    const { sessionId } = req.body;
    const userId = req.user._id;
    const today = moment().format("YYYY-MM-DD");
    const now = moment();

    const session = await Session.findById(sessionId);
    if (!session) {
      return res.status(404).json({ message: "Session not found" });
    }

    const classGroup = await Conversation.findById(session.classId);
    if (!classGroup || !classGroup.group.members.includes(userId)) {
      return res.status(403).json({ message: "Access denied" });
    }

    let attendanceLog = await AttendanceLog.findOne({
      sessionId,
      userId,
      sessionDate: today,
    });

    const sessionTime = moment(
      `${session.date} ${session.startTime}`,
      "YYYY-MM-DD HH:mm"
    );
    const status = now.isAfter(sessionTime) ? "late" : "present";

    if (!attendanceLog) {
      attendanceLog = new AttendanceLog({
        sessionId,
        classId: session.classId,
        userId,
        sessionDate: today,
        enteredAt: new Date(),
        status,
      });
    } else {
      attendanceLog.enteredAt = new Date();
      attendanceLog.status = status;
      attendanceLog.leftAt = null;
    }

    await attendanceLog.save();
    res.json({
      message: "Attendance marked successfully",
      attendance: attendanceLog,
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Edit attendance
export const editAttendance = async (req, res) => {
  try {
    const { recordId } = req.params;
    const { status, leftAt, duration } = req.body;

    const record = await AttendanceLog.findById(recordId);
    if (!record) {
      return res.status(404).json({ message: "Attendance record not found" });
    }

    const classGroup = await Conversation.findById(record.classId);
    if (!classGroup.group.admins.includes(req.user._id)) {
      return res.status(403).json({ message: "Access denied" });
    }

    if (status) record.status = status;
    if (leftAt) record.leftAt = leftAt;
    if (duration) record.duration = duration;

    await record.save();
    res.json({ message: "Attendance updated successfully", record });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Bulk update attendance
export const bulkUpdateAttendance = async (req, res) => {
  try {
    const { sessionId, updates } = req.body; // updates: [{ userId, status, duration, leftAt }]

    const session = await Session.findById(sessionId);
    if (!session) {
      return res.status(404).json({ message: "Session not found" });
    }

    const classGroup = await Conversation.findById(session.classId);
    if (!classGroup.group.admins.includes(req.user._id)) {
      return res.status(403).json({ message: "Access denied" });
    }

    const bulkOps = updates.map(({ userId, status, duration, leftAt }) => ({
      updateOne: {
        filter: { sessionId, userId, sessionDate: session.date },
        update: { $set: { status, duration, leftAt } },
        upsert: true,
      },
    }));

    await AttendanceLog.bulkWrite(bulkOps);
    res.json({ message: "Bulk attendance updated successfully" });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Get session attendance
export const getSessionAttendance = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { page = 1, limit = 10 } = req.query;

    const session = await Session.findById(sessionId);
    if (!session) {
      return res.status(404).json({ message: "Session not found" });
    }

    const classGroup = await Conversation.findById(session.classId);
    if (!classGroup || !classGroup.group.members.includes(req.user._id)) {
      return res.status(403).json({ message: "Access denied" });
    }

    const attendance = await AttendanceLog.find({ sessionId })
      .populate("userId", "name email image")
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ enteredAt: -1 });

    const total = await AttendanceLog.countDocuments({ sessionId });

    const stats = await AttendanceLog.aggregate([
      { $match: { sessionId } },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
    ]);

    const summary = {
      totalStudents: classGroup.group.members.length,
      present: stats.find((s) => s._id === "present")?.count || 0,
      late: stats.find((s) => s._id === "late")?.count || 0,
      absent: stats.find((s) => s._id === "absent")?.count || 0,
    };

    res.json({
      attendance,
      summary,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total,
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Get student attendance
export const getStudentAttendance = async (req, res) => {
  try {
    const { studentId } = req.params;
    const { classId, page = 1, limit = 10 } = req.query;

    const classGroup = await Conversation.findById(classId);
    if (!classGroup || !classGroup.group.members.includes(req.user._id)) {
      return res.status(403).json({ message: "Access denied" });
    }

    const attendance = await AttendanceLog.find({ userId: studentId, classId })
      .populate("sessionId", "date startTime")
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ sessionDate: -1 });

    const total = await AttendanceLog.countDocuments({
      userId: studentId,
      classId,
    });

    const stats = await AttendanceLog.aggregate([
      { $match: { userId: studentId, classId } },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
    ]);

    const presentCount = stats.find((s) => s._id === "present")?.count || 0;
    const totalSessions = stats.reduce((sum, s) => sum + s.count, 0);
    const presentRate =
      totalSessions > 0 ? ((presentCount / totalSessions) * 100).toFixed(2) : 0;

    res.json({
      attendance,
      presentRate,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total,
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

export const getClassAttendance = async (req, res) => {
  try {
    const { classId } = req.params;
    const { date, view = "daily" } = req.query;

    // Check user
    // if (!req.user) {
    //   return res.status(401).json({ message: "Unauthorized" });
    // }

    // Find class
    const classGroup = await Conversation.findById(classId);
    if (!classGroup || !classGroup.group.members.includes(req.user._id)) {
      return res.status(403).json({ message: "Access denied" });
    }

    // Build filter
    let filter = { classId };
    if (date) filter.sessionDate = date;

    // Fetch attendance
    const attendance = await AttendanceLog.find(filter)
      .populate("userId", "name email image")
      .populate("sessionId", "date startTime")
      .sort({ sessionDate: -1 });

    res.json({ attendance });
  } catch (error) {
    console.error("getClassAttendance error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};
// Get class attendance analytics
export const getAttendanceAnalytics = async (req, res) => {
  try {
    const { classId } = req.params;
    const { startDate, endDate } = req.query;

    const classGroup = await Conversation.findById(classId);
    console.log(classGroup);

    if (!classGroup || !classGroup.group.members.includes(req.user._id)) {
      return res.status(403).json({ message: "Access denied" });
    }
    const dateFilter = { classId };
    if (startDate && endDate) {
      dateFilter.sessionDate = { $gte: startDate, $lte: endDate };
    }
    const totalSessions = await Session.countDocuments({ classId });
    const attendanceTrends = await AttendanceLog.aggregate([
      { $match: dateFilter },
      {
        $group: {
          _id: "$sessionDate",
          present: { $sum: { $cond: [{ $eq: ["$status", "present"] }, 1, 0] } },
          late: { $sum: { $cond: [{ $eq: ["$status", "late"] }, 1, 0] } },
          absent: { $sum: { $cond: [{ $eq: ["$status", "absent"] }, 1, 0] } },
          total: { $sum: 1 },
        },
      },
      {
        $project: {
          date: "$_id",
          present: 1,
          late: 1,
          absent: 1,
          total: 1,
          rate: {
            $round: [
              { $multiply: [{ $divide: ["$present", "$total"] }, 100] },
              2,
            ],
          },
        },
      },
      { $sort: { date: 1 } },
    ]);
    const avgAttendance = attendanceTrends.length
      ? (
          attendanceTrends.reduce((sum, day) => sum + day.rate, 0) /
          attendanceTrends.length
        ).toFixed(2)
      : 0;

    const weeklyTrends = await AttendanceLog.aggregate([
      { $match: dateFilter },
      {
        $group: {
          _id: { $week: { $dateFromString: { dateString: "$sessionDate" } } },
          present: { $sum: { $cond: [{ $eq: ["$status", "present"] }, 1, 0] } },
          total: { $sum: 1 },
        },
      },
      {
        $project: {
          week: "$_id",
          rate: {
            $round: [
              { $multiply: [{ $divide: ["$present", "$total"] }, 100] },
              2,
            ],
          },
        },
      },
      { $sort: { week: 1 } },
    ]);

    res.json({
      totalSessions,
      attendanceTrends,
      weeklyTrends,
      averageAttendance: avgAttendance,
    });
  } catch (error) {
    res.status(500).json({ message: "Server errorrrr", error: error.message });
  }
};

// Get global attendance analytics
export const getGlobalAttendanceAnalytics = async (req, res) => {
  try {
    const classes = await Conversation.find({ "group.type": "classroom" });
    const classIds = classes.map((c) => c._id);

    const analytics = await Promise.all(
      classIds.map(async (classId) => {
        const classGroup = await Conversation.findById(classId);
        const attendance = await AttendanceLog.aggregate([
          { $match: { classId } },
          {
            $group: {
              _id: "$sessionDate",
              present: {
                $sum: { $cond: [{ $eq: ["$status", "present"] }, 1, 0] },
              },
              total: { $sum: 1 },
            },
          },
          {
            $project: {
              rate: {
                $round: [
                  { $multiply: [{ $divide: ["$present", "$total"] }, 100] },
                  2,
                ],
              },
            },
          },
        ]);

        const avgRate = attendance.length
          ? (
              attendance.reduce((sum, day) => sum + day.rate, 0) /
              attendance.length
            ).toFixed(2)
          : 0;

        return {
          classId,
          className: classGroup.group.name,
          attendanceRate: avgRate,
          totalSessions: await Session.countDocuments({ classId }),
        };
      })
    );

    const sortedAnalytics = analytics.sort(
      (a, b) => b.attendanceRate - a.attentionRate
    );
    const needsAttention = analytics.filter((a) => a.attendanceRate < 70); // Threshold for low attendance

    res.json({
      bestPerforming: sortedAnalytics[0],
      needsAttention,
      allClasses: sortedAnalytics,
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};
