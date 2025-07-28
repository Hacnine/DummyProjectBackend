import { sendMessage, deleteMessage, markMessagesAsRead } from "../controllers/messageController.js";

export const registerChatHandlers = (io, socket) => {
  socket.on("joinRoom", (conversationId) => {
    socket.join(conversationId);
  });

  socket.on("leaveRoom", (conversationId) => {
    socket.leave(conversationId);
  });

  socket.on("typing", ({ conversationId, userId, isTyping }) => {
    io.to(conversationId).emit("typing", { userId, isTyping });
  });

  socket.on("sendMessage", async ({ conversationId, sender, receiver, text, media }) => {
    await sendMessage({ io, socket, conversationId, sender, receiver, text, media });
  });

  socket.on("messageRead", async ({ conversationId, userId }) => {
    await markMessagesAsRead(conversationId, userId, io);
  });

  socket.on("deleteMessage", async ({ messageId, userId }) => {
    await deleteMessage({ io, socket, messageId, userId });
  });

  // Handle socket disconnection
  socket.on("disconnect", () => {
  });
};