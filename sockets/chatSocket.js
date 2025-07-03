import { onlineUsers } from "./onlineUserSocket.js";

export const registerChatHandlers = (io, socket) => {
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
};
