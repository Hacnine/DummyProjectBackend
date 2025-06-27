import AttendanceLog from "../models/attendanceLogModel.js"
import Conversation from "../models/conversationModel.js"

// Mark attendance
export const markAttendance = async (req, res) => {
  try {
    const { classId } = req.params
    const userId = req.user._id

    // Check if user is a member of the class
    const classGroup = await Conversation.findById(classId)
    if (!classGroup || !classGroup.group.members.includes(userId)) {
      return res.status(403).json({ message: "Access denied" })
    }

    const today = new Date().toISOString().split("T")[0] // YYYY-MM-DD

    // Check if already logged for today
    let attendanceLog = await AttendanceLog.findOne({ classId, userId, sessionDate: today })

    if (!attendanceLog) {
      attendanceLog = new AttendanceLog({
        classId,
        userId,
        sessionDate: today,
        enteredAt: new Date(),
      })
      await attendanceLog.save()
    } else {
      // Update entry time if re-entering
      attendanceLog.enteredAt = new Date()
      attendanceLog.leftAt = null
      await attendanceLog.save()
    }

    res.json({
      message: "Attendance marked successfully",
      attendance: attendanceLog,
    })
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

// Get class attendance
export const getClassAttendance = async (req, res) => {
  try {
    const { classId } = req.params
    const { date, view = "daily", page = 1, limit = 10 } = req.query

    // Check if user has access to class
    const classGroup = await Conversation.findById(classId)
    if (!classGroup || !classGroup.group.members.includes(req.user._id)) {
      return res.status(403).json({ message: "Access denied" })
    }

    const dateFilter = {}
    if (date) {
      const targetDate = new Date(date)
      switch (view) {
        case "daily":
          dateFilter.sessionDate = date
          break
        case "weekly":
          const weekStart = new Date(targetDate)
          weekStart.setDate(targetDate.getDate() - targetDate.getDay())
          const weekEnd = new Date(weekStart)
          weekEnd.setDate(weekStart.getDate() + 6)
          dateFilter.sessionDate = {
            $gte: weekStart.toISOString().split("T")[0],
            $lte: weekEnd.toISOString().split("T")[0],
          }
          break
        case "monthly":
          const monthStart = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1)
          const monthEnd = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 0)
          dateFilter.sessionDate = {
            $gte: monthStart.toISOString().split("T")[0],
            $lte: monthEnd.toISOString().split("T")[0],
          }
          break
      }
    }

    const attendance = await AttendanceLog.find({ classId, ...dateFilter })
      .populate("userId", "name email image")
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ enteredAt: -1 })

    const total = await AttendanceLog.countDocuments({ classId, ...dateFilter })

    res.json({
      attendance,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total,
    })
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

// Get user attendance
export const getUserAttendance = async (req, res) => {
  try {
    const { userId, classId } = req.params
    const { page = 1, limit = 10 } = req.query

    // Check if user has access
    const classGroup = await Conversation.findById(classId)
    if (!classGroup || !classGroup.group.members.includes(req.user._id)) {
      return res.status(403).json({ message: "Access denied" })
    }

    const attendance = await AttendanceLog.find({ classId, userId })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ enteredAt: -1 })

    const total = await AttendanceLog.countDocuments({ classId, userId })

    res.json({
      attendance,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total,
    })
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

// Update attendance record
export const updateAttendanceRecord = async (req, res) => {
  try {
    const { recordId } = req.params
    const { leftAt, duration } = req.body

    const record = await AttendanceLog.findById(recordId)
    if (!record) {
      return res.status(404).json({ message: "Attendance record not found" })
    }

    // Check if user is admin of the class
    const classGroup = await Conversation.findById(record.classId)
    if (!classGroup.group.admins.includes(req.user._id)) {
      return res.status(403).json({ message: "Access denied" })
    }

    if (leftAt) record.leftAt = leftAt
    if (duration) record.duration = duration

    await record.save()

    res.json({
      message: "Attendance record updated successfully",
      record,
    })
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

// Delete attendance record
export const deleteAttendanceRecord = async (req, res) => {
  try {
    const { recordId } = req.params

    const record = await AttendanceLog.findById(recordId)
    if (!record) {
      return res.status(404).json({ message: "Attendance record not found" })
    }

    // Check if user is admin of the class
    const classGroup = await Conversation.findById(record.classId)
    if (!classGroup.group.admins.includes(req.user._id)) {
      return res.status(403).json({ message: "Access denied" })
    }

    await AttendanceLog.findByIdAndDelete(recordId)

    res.json({ message: "Attendance record deleted successfully" })
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

// Get attendance statistics
export const getAttendanceStats = async (req, res) => {
  try {
    const { classId } = req.params

    // Check if user has access
    const classGroup = await Conversation.findById(classId)
    if (!classGroup || !classGroup.group.members.includes(req.user._id)) {
      return res.status(403).json({ message: "Access denied" })
    }

    const stats = await AttendanceLog.aggregate([
      { $match: { classId: classId } },
      {
        $group: {
          _id: null,
          totalRecords: { $sum: 1 },
          uniqueStudents: { $addToSet: "$userId" },
          totalDays: { $addToSet: "$sessionDate" },
          averageDuration: { $avg: "$duration" },
        },
      },
      {
        $project: {
          totalRecords: 1,
          uniqueStudents: { $size: "$uniqueStudents" },
          totalDays: { $size: "$totalDays" },
          averageDuration: { $round: ["$averageDuration", 2] },
          attendanceRate: {
            $round: [
              {
                $multiply: [
                  {
                    $divide: ["$totalRecords", { $multiply: [{ $size: "$uniqueStudents" }, { $size: "$totalDays" }] }],
                  },
                  100,
                ],
              },
              2,
            ],
          },
        },
      },
    ])

    res.json({
      stats: stats.length > 0 ? stats[0] : { totalRecords: 0, uniqueStudents: 0, totalDays: 0, attendanceRate: 0 },
    })
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

// Get attendance report
export const getAttendanceReport = async (req, res) => {
  try {
    const { classId } = req.params
    const { startDate, endDate } = req.query

    // Check if user is admin
    const classGroup = await Conversation.findById(classId)
    if (!classGroup.group.admins.includes(req.user._id)) {
      return res.status(403).json({ message: "Access denied" })
    }

    const dateFilter = { classId }
    if (startDate && endDate) {
      dateFilter.sessionDate = { $gte: startDate, $lte: endDate }
    }

    const report = await AttendanceLog.aggregate([
      { $match: dateFilter },
      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          as: "user",
        },
      },
      { $unwind: "$user" },
      {
        $group: {
          _id: "$userId",
          userName: { $first: "$user.name" },
          userEmail: { $first: "$user.email" },
          totalSessions: { $sum: 1 },
          totalDuration: { $sum: "$duration" },
          averageDuration: { $avg: "$duration" },
          sessions: {
            $push: {
              date: "$sessionDate",
              enteredAt: "$enteredAt",
              leftAt: "$leftAt",
              duration: "$duration",
            },
          },
        },
      },
      { $sort: { userName: 1 } },
    ])

    res.json({ report })
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

// Export attendance data
export const exportAttendance = async (req, res) => {
  try {
    const { classId } = req.params
    const { format = "json" } = req.query

    // Check if user is admin
    const classGroup = await Conversation.findById(classId)
    if (!classGroup.group.admins.includes(req.user._id)) {
      return res.status(403).json({ message: "Access denied" })
    }

    const attendance = await AttendanceLog.find({ classId })
      .populate("userId", "name email")
      .sort({ sessionDate: -1, enteredAt: -1 })

    if (format === "csv") {
      // In a real implementation, you'd generate CSV
      res.setHeader("Content-Type", "text/csv")
      res.setHeader("Content-Disposition", "attachment; filename=attendance.csv")
      res.send("CSV export not implemented yet")
    } else {
      res.json({ attendance })
    }
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message })
  }
}
