import {
  deleteMessage,
  markMessagesAsRead,
  sendTextMessage,
  handleSendEmojiSocket,
} from "../controllers/messageController.js";

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
    if (!sender) {
      console.error("Invalid sender for sendMessage");
      return;
    }
    await sendTextMessage({
      io,
      socket,
      conversationId,
      sender,
      receiver,
      text,
      media,
    });
  });

  socket.on("sendEmoji", async ({ conversationId, sender, receiver, data }) => {
    console.log("Received sendEmoji event:", { conversationId, sender, receiver, data });
    if (!sender || !data) {
      console.error("Invalid sendEmoji event data:", { sender, data });
      socket.emit("sendMessageError", { message: "Invalid sender or data" });
      return;
    }
    try {
       await handleSendEmojiSocket({
        userId: sender,
        conversationId,
        receiver,
        data,
        isSocket: true,
        socket,
        io,
      });
      // console.log("handleSendEmojiSocket result:", result);
      
    } catch (error) {
      console.error("sendEmoji handler error:", error.message);
      socket.emit("sendMessageError", { message: "Server error" });
    }
  });

  socket.on("messageRead", async ({ conversationId, userId }) => {
    await markMessagesAsRead(conversationId, userId, io);
  });

  socket.on("deleteMessage", async ({ messageId, userId }) => {
    await deleteMessage({ io, socket, messageId, userId });
  });

  // Handle socket disconnection
  socket.on("disconnect", () => {});
};
