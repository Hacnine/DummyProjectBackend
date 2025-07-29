import { deleteMessage, markMessagesAsRead, sendTextMessage } from "../controllers/messageController.js";

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
    await sendTextMessage({ io, socket, conversationId, sender, receiver, text, media });
  });


//   socket.on("sendMessage", async ({ conversationId, sender, receiver, text, media }) => {
//   const result = await handleSendMessage({
//     userId: sender,
//     conversationId,
//     receiver,
//     text,
//     media,
//     isSocket: true,
//     socket,
//     io,
//   });

//   if (!result.success) {
//     socket.emit("sendMessageError", { message: result.message });
//   } else {
//     io.to(result.conversationId.toString()).emit("receiveMessage", result.message);
//     socket.emit("sendMessageSuccess", result);
//   }
// });

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