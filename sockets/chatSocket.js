export const registerChatHandlers = (io, socket) => {
  socket.on("joinRoom", (conversationId) => {
    socket.join(conversationId);
  });

  socket.on("typing", ({ conversationId, userId, isTyping }) => {
    io.to(conversationId).emit("typing", { userId, isTyping });
  });

  socket.on("sendMessage", (message) => {
    // Emit to all users in the conversation room
    io.to(message.conversationId).emit("receiveMessage", message);
  });
};