import Session from "../models/sessionModel.js";
import AttendanceLog from "../models/attendanceLogModel.js";
import Conversation from "../models/conversationModel.js";
import moment from "moment";

// Create manual session
export const createManualSession = async (req, res) => {
  try {
    const { date, startTime, cutoffTime, duration } = req.body;
    const createdBy = req.user._id.toString();
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

export const autoGenerateSessions = async (req, res) => {
  try {
    const { classId } = req.body;
    const today = moment().format("YYYY-MM-DD");
    const todayDay = moment().day();

    const classGroup = await Conversation.findById(classId);
    if (!classGroup) {
      return res.status(404).json({ message: "Class not found" });
    }

    const startTime = classGroup.group.startTime || "09:00";
    const cutoffTime = classGroup.group.cutoffTime || "09:15";
    const classType = classGroup.group.classType || "regular";

    // Check if a session already exists for today
    const existingSession = await Session.findOne({
      classId,
      date: today,
    });
    if (existingSession) {
      return res.status(400).json({ message: `Session already exists for class ${classId} on ${today}` });
    }

    let shouldCreateSession = false;
    if (classType === "regular") {
      shouldCreateSession = true;
    } else if (classType === "multi-weekly") {
      const selectedDays = classGroup.group.selectedDays || [];
      if (selectedDays.includes(todayDay)) {
        shouldCreateSession = true;
      }
    }

    if (shouldCreateSession) {
      const session = new Session({
        classId,
        date: today,
        startTime,
        cutoffTime,
        type: "auto",
      });
      await session.save();
      res.json({ message: "Session created successfully", session });
    } else {
      res.status(400).json({ message: `No session created for class ${classId} on ${today} (classType: ${classType}, todayDay: ${todayDay})` });
    }
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

export const getLastSession = async (req, res) => {
  try {
    const { classId } = req.query;

    if (!classId) {
      return res.status(400).json({ message: "Missing classId in query" });
    }

    const session = await Session.findOne({ classId })
      .sort({ date: -1, startTime: -1 }) // Get latest session
      .select("_id date startTime duration status"); // Pick only needed fields

    if (!session) {
      return res.status(404).json({ message: "No session found" });
    }

    // Send as clean object
    res.json({
      id: session._id,
      date: session.date,
      time: session.startTime,
      duration: session.duration,
      status: session.status,
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};


// Mark attendance
export const markAttendance = async (req, res) => {
  try {
    const { sessionId, classId, enteredAt } = req.body;

    const userId = req.user._id.toString();
    const today = moment().format("YYYY-MM-DD");
    const now = moment();

    const session = await Session.findById(sessionId);
    if (!session) {
      return res.status(404).json({ message: "Session not found" });
    }

    const classGroup = await Conversation.findById(session.classId);
    if (!classGroup || !classGroup.participants.includes(userId)) {
      return res.status(403).json({ message: "Access denied" });
    }

    let attendanceLog = await AttendanceLog.findOne({
      sessionId,
      userId,
      sessionDate: today,
    });

    const sessionTime = moment(`${session.date} ${session.startTime}`, "YYYY-MM-DD HH:mm");
    const status = enteredAt
      ? moment(enteredAt).isAfter(sessionTime)
        ? "late"
        : "present"
      : now.isAfter(sessionTime)
      ? "late"
      : "present";

    if (!attendanceLog) {
      attendanceLog = new AttendanceLog({
        sessionId,
        classId: session.classId,
        userId,
        sessionDate: today,
        enteredAt: enteredAt || new Date(),
        status,
      });
    } else {
      attendanceLog.enteredAt = enteredAt || new Date();
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
    if (!classGroup.group.admins.includes(req.user._id.toString())) {
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

export const bulkUpdateAttendance = async (req, res) => {
  try {
    const { sessionId, updates } = req.body; // updates: [{ userId, status, duration, leftAt }]
// console.log(updates, "sessionID")
    const session = await Session.findById(sessionId);
    if (!session) {
      return res.status(404).json({ message: "Session not found" });
    }

    const classGroup = await Conversation.findById(session.classId);
    if (!classGroup.group.admins.includes(req.user._id.toString())) {
      return res.status(403).json({ message: "Access denied" });
    }

    const validStatuses = ["present", "late", "absent", "excused"];
    const bulkOps = updates
      .filter(({ userId, status }) => classGroup.participants.includes(userId) && validStatuses.includes(status))
      .map(({ userId, status, duration, leftAt }) => ({
        updateOne: {
          filter: { sessionId, userId, sessionDate: session.date },
          update: { $set: { status, duration, leftAt } },
          upsert: true,
        },
      }));

    if (bulkOps.length === 0) {
      return res.status(400).json({ message: "No valid updates provided" });
    }

    await AttendanceLog.bulkWrite(bulkOps);
    res.json({ message: `Bulk attendance updated successfully for ${bulkOps.length} students` });
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
    if (!classGroup || !classGroup.participants.includes(req.user._id.toString())) {
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
      totalStudents: classGroup.participants.length,
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
    if (!classGroup || !classGroup.participants.includes(req.user._id.toString())) {
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
    if (!classGroup || !classGroup.participants.includes(req.user._id.toString())) {
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
    const { startDate, endDate, view = "daily" } = req.query;

    // Validate class and user access
    const classGroup = await Conversation.findById(classId);
    if (!classGroup || !classGroup.participants.includes(req.user._id.toString())) {
      return res.status(403).json({ message: "Access denied" });
    }

    // Build date filter
    let dateFilter = { classId };
    if (startDate && endDate) {
      dateFilter.sessionDate = {
        $gte: moment(startDate).format("YYYY-MM-DD"),
        $lte: moment(endDate).format("YYYY-MM-DD"),
      };
    } else {
      // Default to last 30 days if no date range provided
      dateFilter.sessionDate = {
        $gte: moment().subtract(30, "days").format("YYYY-MM-DD"),
        $lte: moment().format("YYYY-MM-DD"),
      };
    }

    // Aggregate attendance statistics
    const stats = await AttendanceLog.aggregate([
      { $match: dateFilter },
      {
        $group: {
          _id: {
            ...(view === "daily" && { date: "$sessionDate" }),
            ...(view === "weekly" && {
              week: { $isoWeek: { $dateFromString: { dateString: "$sessionDate" } } },
              year: { $isoWeekYear: { $dateFromString: { dateString: "$sessionDate" } } },
            }),
            ...(view === "monthly" && {
              month: { $month: { $dateFromString: { dateString: "$sessionDate" } } },
              year: { $year: { $dateFromString: { dateString: "$sessionDate" } } },
            }),
            status: "$status",
          },
          count: { $sum: 1 },
        },
      },
      {
        $group: {
          _id: view === "daily" ? "$_id.date" : view === "weekly" ? { week: "$_id.week", year: "$_id.year" } : { month: "$_id.month", year: "$_id.year" },
          statuses: {
            $push: {
              status: "$_id.status",
              count: "$count",
            },
          },
          total: { $sum: "$count" },
        },
      },
      {
        $sort: view === "daily" ? { _id: 1 } : { "_id.year": 1, "_id.week": 1, "_id.month": 1 },
      },
    ]);

    // Calculate overall summary
    const overallStats = await AttendanceLog.aggregate([
      { $match: dateFilter },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
    ]);

    const totalSessions = await Session.countDocuments({
      classId,
      date: { $gte: dateFilter.sessionDate.$gte, $lte: dateFilter.sessionDate.$lte },
    });

    // Initialize summary with default values
    const summary = {
      totalStudents: classGroup.participants.length,
      totalSessions,
      present: 0,
      late: 0,
      absent: 0,
      excused: 0,
      attendanceRate: "0.00",
    };

    // Populate summary with actual counts
    overallStats.forEach((stat) => {
      if (stat._id === "present") summary.present = stat.count;
      if (stat._id === "late") summary.late = stat.count;
      if (stat._id === "absent") summary.absent = stat.count;
      if (stat._id === "excused") summary.excused = stat.count;
    });

    // Calculate attendance rate
    const totalPossibleAttendance = totalSessions * summary.totalStudents;
    summary.attendanceRate =
      totalPossibleAttendance > 0
        ? ((summary.present / totalPossibleAttendance) * 100).toFixed(2)
        : "0.00";

    // Format data for chart
    const chartData = stats.map((stat) => {
      const present = stat.statuses.find((s) => s.status === "present")?.count || 0;
      const late = stat.statuses.find((s) => s.status === "late")?.count || 0;
      const absent = stat.statuses.find((s) => s.status === "absent")?.count || 0;
      const excused = stat.statuses.find((s) => s.status === "excused")?.count || 0;

      return {
        period: view === "daily" ? stat._id : view === "weekly" ? `Week ${stat._id.week}, ${stat._id.year}` : `${moment.months(stat._id.month - 1)} ${stat._id.year}`,
        present,
        late,
        absent,
        excused,
        attendanceRate: stat.total > 0 ? ((present / stat.total) * 100).toFixed(2) : "0.00",
      };
    });

    // Create chart for attendance trends
    const chart = {
      type: "bar",
      data: {
        labels: chartData.map((d) => d.period),
        datasets: [
          {
            label: "Present",
            data: chartData.map((d) => d.present),
            backgroundColor: "#4CAF50",
          },
          {
            label: "Late",
            data: chartData.map((d) => d.late),
            backgroundColor: "#FFC107",
          },
          {
            label: "Absent",
            data: chartData.map((d) => d.absent),
            backgroundColor: "#F44336",
          },
          {
            label: "Excused",
            data: chartData.map((d) => d.excused),
            backgroundColor: "#2196F3",
          },
        ],
      },
      options: {
        scales: {
          x: { stacked: true },
          y: { stacked: true, beginAtZero: true, title: { display: true, text: "Number of Students" } },
        },
        plugins: {
          title: { display: true, text: `Attendance Analytics (${view.charAt(0).toUpperCase() + view.slice(1)})` },
          legend: { position: "top" },
        },
      },
    };

    res.json({
      summary,
      chartData,
      chart,
    });
  } catch (error) {
    console.error("getAttendanceAnalytics error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
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


export const getAttendanceOverview = async (req, res) => {
  try {
    const { classId } = req.params;

    // Validate classId
    if (!classId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ message: "Invalid classId" });
    }

    // Fetch all attendance records for the class
    const attendanceRecords = await AttendanceLog.find({ classId }).lean();

    // Calculate total records
    const totalRecords = attendanceRecords.length;

    // Calculate unique days tracked
    const daysTracked = new Set(attendanceRecords.map(record => record.sessionDate)).size;

    // Calculate attendance rate
    // Attendance rate = (present + late) / total records * 100
    const presentOrLateRecords = attendanceRecords.filter(record =>
      ["present", "late"].includes(record.status)
    ).length;
    const attendanceRate = totalRecords > 0
      ? ((presentOrLateRecords / totalRecords) * 100).toFixed(2)
      : 0;

    res.json({
      attendance: attendanceRecords,
      analytics: {
        attendanceRate,
        totalRecords,
        daysTracked
      }
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};