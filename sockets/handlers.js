import { addOnlineUser, removeOnlineUser, sendOnlineUsersList, onlineUsers } from './onlineUserSocket.js';
import userModel from "../models/userModel.js";
import registerAlertnessHandlers from "./alertnessSocket.js";

export const registerSocketEvents = (io, socket) => {
  const userId = socket.user?.id;
  const socketId = socket.id;

  if (userId) {
    addOnlineUser(userId, socketId, userModel).then(() => {
      sendOnlineUsersList(io);
    });
  }

  registerAlertnessHandlers(io, socket);

  socket.on("userOnline", async (id) => {
    if (id && !onlineUsers.has(id)) {
      await addOnlineUser(id, socket.id, userModel);
      sendOnlineUsersList(io);
    }
  });

  socket.on("joinRoom", (conversationId) => {
    socket.join(conversationId);
  });

  socket.on("typing", ({ conversationId, userId, isTyping }) => {
    io.to(conversationId).emit("typing", { userId, isTyping });
  });

  socket.on("sendMessage", (message) => {
    const receiver = onlineUsers.get(message.receiver);
    if (receiver) {
      io.to(receiver.socketId).emit("receiveMessage", message);
    }
  });

  socket.on("disconnect", () => {
    if (userId) {
      removeOnlineUser(userId);
      sendOnlineUsersList(io);
    }
  });
};