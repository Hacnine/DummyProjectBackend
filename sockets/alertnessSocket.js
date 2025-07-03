import {
  startAlertnessSession,
  endAlertnessSession,
  respondToAlertnessSession,
  getAlertnessSessions,
} from "../controllers/alertnessController.js";

export default function registerAlertnessHandlers(io, socket) {
  // Join class room for alertness
  socket.on("joinClass", (classId) => {
    socket.join(classId);
  });

  // Helper to emit updated session history to the room
  async function emitSessionHistory(classId, userId) {
    const req = {
      params: { classId },
      user: { _id: userId },
      query: {},
    };
    const res = {
      status: () => res,
      json: (data) => {
        io.to(classId).emit("alertnessSessionHistory", { sessions: data.sessions });
      },
    };
    await getAlertnessSessions(req, res);
  }

  // Start alertness session
  socket.on("startAlertnessSession", async ({ classId, duration, startedBy }) => {
    try {
      const req = {
        params: { classId },
        body: { duration },
        user: { _id: socket.user.id, name: startedBy },
        io,
      };
      const res = {
        status: () => res,
        json: async (data) => {
          io.to(classId).emit("alertnessSessionStarted", {
            sessionId: data.session._id,
            duration: data.session.duration,
            startedBy: startedBy,
          });
          // Emit updated session history
          await emitSessionHistory(classId, socket.user.id);
        },
      };
      await startAlertnessSession(req, res);
    } catch (err) {
      socket.emit("alertnessError", { message: err.message });
    }
  });

  // End alertness session
  socket.on("endAlertnessSession", async ({ classId }) => {
    try {
      const req = {
        params: { classId },
        user: { _id: socket.user.id },
        io,
      };
      const res = {
        status: () => res,
        json: async (data) => {
          io.to(classId).emit("alertnessSessionEnded", {
            sessionId: data.session._id,
            responseRate: data.session.responseRate,
          });
          // Emit updated session history
          await emitSessionHistory(classId, socket.user.id);
        },
      };
      await endAlertnessSession(req, res);
    } catch (err) {
      socket.emit("alertnessError", { message: err.message });
    }
  });

  // Respond to alertness session
  socket.on("respondToAlertnessSession", async ({ classId, userId }) => {
    try {
      const req = {
        params: { classId },
        user: { _id: userId },
      };
      const res = {
        status: () => res,
        json: async (data) => {
          // Optionally emit an update
          await emitSessionHistory(classId, userId);
        },
      };
      await respondToAlertnessSession(req, res);
    } catch (err) {
      socket.emit("alertnessError", { message: err.message });
    }
  });

  // Get alertness session history
  socket.on("getAlertnessSessionHistory", async (classId) => {
    try {
      const req = {
        params: { classId },
        user: { _id: socket.user.id },
        query: {},
      };
      const res = {
        status: () => res,
        json: (data) => {
          socket.emit("alertnessSessionHistory", { sessions: data.sessions });
        },
      };
      await getAlertnessSessions(req, res);
    } catch (err) {
      socket.emit("alertnessError", { message: err.message });
    }
  });
}