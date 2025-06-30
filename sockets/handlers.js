import { addOnlineUser, removeOnlineUser, sendOnlineUsersList } from './onlineUserUtils.js';
import userModel from "../models/userModel.js";
import registerAlertnessHandlers from "./alertnessSocket.js";

export const registerSocketEvents = (io, socket, redisClient) => {
  const userId = socket.user?.id;
  const socketId = socket.id;

  if (userId) {
    addOnlineUser(redisClient, userId, socketId, userModel).then(() => {
      sendOnlineUsersList(io, redisClient);
    });
  }

  registerAlertnessHandlers(io, socket);

  socket.on("userOnline", async (id) => {
    if (id && !(await redisClient.sIsMember("onlineUsers", id))) {
      await addOnlineUser(redisClient, id, socket.id, userModel);
      await sendOnlineUsersList(io, redisClient);
    }
  });

  socket.on("joinRoom", (conversationId) => {
    socket.join(conversationId);
  });

  socket.on("typing", ({ conversationId, userId, isTyping }) => {
    io.to(conversationId).emit("typing", { userId, isTyping });
  });

  socket.on("sendMessage", async (message) => {
    const receiverSocketId = await redisClient.hGet("userSocketMap", message.receiver);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit("receiveMessage", message);
    }
  });

  socket.on("disconnect", async () => {
    if (userId) {
      await removeOnlineUser(redisClient, userId);
      await sendOnlineUsersList(io, redisClient);
    }
  });
};
