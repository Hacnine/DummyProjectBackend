
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
        json: (data) => {
          io.to(classId).emit("alertnessSessionStarted", {
            sessionId: data.session._id,
            duration: data.session.duration,
            startedBy: startedBy,
          });
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
        json: (data) => {
          io.to(classId).emit("alertnessSessionEnded", {
            sessionId: data.session._id,
            responseRate: data.session.responseRate,
          });
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
        json: (data) => {
          // Optionally emit an update
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