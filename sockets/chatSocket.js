import {
  deleteMessage,
  markMessagesAsRead,
  sendTextMessage,
  handleSendEmojiSocket,
  sendReplyCore,
  editMessageCore,
  addReaction,
  removeReaction,
} from "../controllers/messageController.js";

export const registerChatHandlers = (io, socket) => {
  socket.on("joinRoom", (conversationId) => {
    // console.log("Socket joining room:", { socketId: socket.id, conversationId });
    socket.join(conversationId);
  });

  socket.on("typing", ({ conversationId, userId, isTyping }) => {
    io.to(conversationId).emit("typing", { userId, isTyping });
  });

  socket.on(
    "sendMessage",
    async ({ conversationId, sender, receiver, text, clientTempId }) => {
      console.log("Received sendMessage:", { conversationId, sender, receiver, text: text?.substring(0, 50), clientTempId });
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
        clientTempId,
      });
    }
  );

  socket.on(
    "sendEmoji",
    async ({ conversationId, sender, receiver, data, clientTempId }) => {
      // console.log("Received sendEmoji event:", { conversationId, sender, receiver, data });
      if (!sender || !data) {
        console.error("Invalid sendEmoji event data:", { sender, data });
        socket.emit("sendMessageError", {
          message: "Invalid sender or data",
          clientTempId,
        }); // Include clientTempId
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
          clientTempId,
        });
      } catch (error) {
        console.error("sendEmoji handler error:", error.message);
        socket.emit("sendMessageError", {
          message: "Server error",
          clientTempId,
        }); // Include clientTempId
      }
    }
  );

  socket.on("messageRead", async ({ conversationId, userId }) => {
    await markMessagesAsRead(conversationId, userId, io);
  });

  socket.on("deleteMessage", async ({ messageId, userId }) => {
    await deleteMessage({ io, socket, messageId, userId });
  });

  socket.on(
    "replyMessage",
    async ({
      conversationId,
      messageId,
      text,
      messageType = "reply",
      htmlEmoji,
      emojiType,
      media,
      clientTempId,
    }) => {
      try {
        // Basic validation
        if (!conversationId || !messageId || !clientTempId) {
          socket.emit("replyMessageError", {
            message:
              "Missing required fields: conversationId, messageId, or clientTempId",
            clientTempId,
          });
          return;
        }
        const sender = socket.user.id;
        const result = await sendReplyCore({
          sender,
          conversationId,
          messageId,
          text,
          messageType,
          htmlEmoji,
          emojiType,
          clientTempId,
        });

        // Optionally handle result if needed (e.g., logging)
        if (!result.success) {
          socket.emit("replyMessageError");
          console.error("replyMessage: Failed to send reply:", result.message);
        }

        io.to(conversationId).emit("replyReceiveMessage", result.message);
        socket.emit("replyMessageSuccess", {
          message: result.message,
          conversationId,
          clientTempId,
        });
      } catch (error) {
        console.error("replyMessage: Error in socket handler:", error);
        socket.emit("replyMessageError", {
          message: error.message || "Server error",
          clientTempId,
        });
      }
    }
  );

  socket.on(
    "editMessage",
    async ({ messageId, text, htmlEmoji, emojiType, clientTempId }) => {
      try {
        // Basic validation
        if (!messageId || !clientTempId) {
          socket.emit("editMessageError", {
            message: "Missing required fields: messageId, or clientTempId",
            clientTempId,
          });
          return;
        }

        const sender = socket.user.id;
        const result = await editMessageCore({
          messageId,
          sender,
          text,
          htmlEmoji,
          emojiType,
          clientTempId,
        });

        if (!result.success) {
          console.error("editMessage: Failed to edit message:", result.message);
          socket.emit("editMessageError", {
            message: result.message,
            clientTempId,
          });
          return;
        }

        // Emit success event with the updated message
        socket.emit("editMessageSuccess", {
          message: result.message,
          clientTempId,
        });
      } catch (error) {
        console.error("editMessage: Error in socket handler:", error);
        socket.emit("editMessageError", {
          message: error.message || "Server error",
          clientTempId,
        });
      }
    }
  );

  socket.on(
    "addReaction",
    async ({ conversationId, messageId, userId, emoji, clientTempId }) => {
      console.log(conversationId, messageId, userId, emoji)
      try {
        if (
          !conversationId ||
          !messageId ||
          !userId ||
          !emoji 
        ) {
          socket.emit("reactionError", {
            message:
              "Missing required fields: conversationId, messageId, userId, emoji, or clientTempId",
            clientTempId,
          });
          return;
        }

        const result = await addReaction({
          conversationId,
          messageId,
          userId,
          emoji,
          clientTempId,
        });

        if (!result.success) {
          socket.emit("reactionError", {
            message: result.message,
            clientTempId,
          });
          return;
        }

        io.to(conversationId).emit("reactionUpdate", {
          messageId: result.message._id,
          reactions: result.message.reactions,
          clientTempId,
        });
        socket.emit("reactionSuccess", {
          messageId: result.message._id,
          reactions: result.message.reactions,
          clientTempId,
        });
      } catch (error) {
        console.error("addReaction: Error in socket handler:", error);
        socket.emit("reactionError", {
          message: error.message || "Server error",
          clientTempId,
        });
      }
    }
  );

  socket.on(
    "removeReaction",
    async ({ conversationId, messageId, userId, clientTempId }) => {
      try {
        if (!conversationId || !messageId || !userId || !clientTempId) {
          socket.emit("reactionError", {
            message:
              "Missing required fields: conversationId, messageId, userId, or clientTempId",
            clientTempId,
          });
          return;
        }

        const result = await removeReaction({
          conversationId,
          messageId,
          userId,
          clientTempId,
        });

        if (!result.success) {
          socket.emit("reactionError", {
            message: result.message,
            clientTempId,
          });
          return;
        }

        io.to(conversationId).emit("reactionUpdate", {
          messageId: result.message._id,
          reactions: result.message.reactions,
          clientTempId,
        });
        socket.emit("reactionSuccess", {
          messageId: result.message._id,
          reactions: result.message.reactions,
          clientTempId,
        });
      } catch (error) {
        console.error("removeReaction: Error in socket handler:", error);
        socket.emit("reactionError", {
          message: error.message || "Server error",
          clientTempId,
        });
      }
    }
  );

  // Handle socket disconnection
  socket.on("disconnect", () => {});
};
