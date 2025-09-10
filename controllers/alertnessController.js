import AlertnessSession from "../models/alertnessSessionModel.js"
import Conversation from "../models/conversationModel.js"

// Start alertness session
export const startAlertnessSession = async (req, res) => {
  try {
    const { classId } = req.params
    const { duration = 30000 } = req.body // Default 30 seconds

    const classGroup = await Conversation.findById(classId)
    if (!classGroup || !classGroup.group.admins.includes(req.user._id)) {
      return res.status(403).json({ message: "Access denied" })
    }

    // Check if there's already an active session
    const activeSession = await AlertnessSession.findOne({ classId, isActive: true })
    if (activeSession) {
      return res.status(400).json({ message: "An alertness session is already active" })
    }

    const session = new AlertnessSession({
      classId,
      startedBy: req.user._id,
      duration,
      totalParticipants: classGroup.participants.length,
    })

    await session.save()

    // Set auto-end timer
    setTimeout(async () => {
      const sessionToEnd = await AlertnessSession.findById(session._id)
      if (sessionToEnd && sessionToEnd.isActive) {
        sessionToEnd.isActive = false
        sessionToEnd.endTime = new Date()
        sessionToEnd.responseRate = (sessionToEnd.responses.length / sessionToEnd.totalParticipants) * 100
        await sessionToEnd.save()

        // Notify class about session end via socket
        if (req.io) {
          req.io.to(classId).emit("alertnessSessionEnded", {
            sessionId: session._id,
            responseRate: sessionToEnd.responseRate,
          })
        }
      }
    }, duration)

    // Notify all class members via socket
    if (req.io) {
      req.io.to(classId).emit("alertnessSessionStarted", {
        sessionId: session._id,
        duration,
        startedBy: req.user.name,
      })
    }

    res.json({
      message: "Alertness session started",
      session,
    })
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

// Respond to alertness session
export const respondToAlertnessSession = async (req, res) => {
  try {
    const { classId } = req.params
    const userId = req.user._id

    const session = await AlertnessSession.findOne({ classId, isActive: true })
    if (!session) {
      return res.status(404).json({ message: "No active alertness session found" })
    }

    // Check if user already responded
    const existingResponse = session.responses.find((r) => r.userId.toString() === userId.toString())
    if (existingResponse) {
      return res.status(400).json({ message: "You have already responded to this session" })
    }

    const responseTime = Date.now() - session.startTime.getTime()

    session.responses.push({
      userId,
      responseTime,
    })

    await session.save()

    res.json({
      message: "Response recorded successfully",
      responseTime,
    })
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

// Get alertness sessions
export const getAlertnessSessions = async (req, res) => {
  try {
    const { classId } = req.params
    const { page = 1, limit = 10 } = req.query

    // Check if user has access to class
    const classGroup = await Conversation.findById(classId)
    if (!classGroup || !classGroup.participants.includes(req.user._id)) {
      return res.status(403).json({ message: "Access denied" })
    }

    const sessions = await AlertnessSession.find({ classId })
      .populate("startedBy", "name email")
      .populate("responses.userId", "name email")
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ startTime: -1 })

    const total = await AlertnessSession.countDocuments({ classId })

    res.json({
      sessions,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total,
    })
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

// Get active session
export const getActiveSession = async (req, res) => {
  try {
    const { classId } = req.params

    // Check if user has access to class
    const classGroup = await Conversation.findById(classId)
    if (!classGroup || !classGroup.participants.includes(req.user._id)) {
      return res.status(403).json({ message: "Access denied" })
    }

    const session = await AlertnessSession.findOne({ classId, isActive: true })
      .populate("startedBy", "name email")
      .populate("responses.userId", "name email")

    res.json({ session })
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

// End alertness session
export const endAlertnessSession = async (req, res) => {
  try {
    const { classId } = req.params

    const classGroup = await Conversation.findById(classId)
    if (!classGroup || !classGroup.group.admins.includes(req.user._id)) {
      return res.status(403).json({ message: "Access denied" })
    }

    const session = await AlertnessSession.findOne({ classId, isActive: true })
    if (!session) {
      return res.status(404).json({ message: "No active session found" })
    }

    session.isActive = false
    session.endTime = new Date()
    session.responseRate = (session.responses.length / session.totalParticipants) * 100
    await session.save()

    // Notify class via socket
    if (req.io) {
      req.io.to(classId).emit("alertnessSessionEnded", {
        sessionId: session._id,
        responseRate: session.responseRate,
      })
    }

    res.json({
      message: "Alertness session ended",
      session,
    })
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

// Get session statistics
export const getSessionStats = async (req, res) => {
  try {
    const { sessionId } = req.params

    const session = await AlertnessSession.findById(sessionId)
      .populate("startedBy", "name email")
      .populate("responses.userId", "name email")

    if (!session) {
      return res.status(404).json({ message: "Session not found" })
    }

    // Check if user has access
    const classGroup = await Conversation.findById(session.classId)
    if (!classGroup || !classGroup.participants.includes(req.user._id)) {
      return res.status(403).json({ message: "Access denied" })
    }

    const stats = {
      sessionId: session._id,
      totalParticipants: session.totalParticipants,
      totalResponses: session.responses.length,
      responseRate: session.responseRate,
      averageResponseTime:
        session.responses.length > 0
          ? session.responses.reduce((sum, r) => sum + r.responseTime, 0) / session.responses.length
          : 0,
      fastestResponse: session.responses.length > 0 ? Math.min(...session.responses.map((r) => r.responseTime)) : 0,
      slowestResponse: session.responses.length > 0 ? Math.max(...session.responses.map((r) => r.responseTime)) : 0,
      duration: session.duration,
      startTime: session.startTime,
      endTime: session.endTime,
      isActive: session.isActive,
    }

    res.json({ stats })
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

// Delete alertness session
export const deleteAlertnessSession = async (req, res) => {
  try {
    const { sessionId } = req.params

    const session = await AlertnessSession.findById(sessionId)
    if (!session) {
      return res.status(404).json({ message: "Session not found" })
    }

    // Check if user is admin of the class
    const classGroup = await Conversation.findById(session.classId)
    if (!classGroup.group.admins.includes(req.user._id)) {
      return res.status(403).json({ message: "Access denied" })
    }

    await AlertnessSession.findByIdAndDelete(sessionId)

    res.json({ message: "Alertness session deleted successfully" })
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message })
  }
}
