// conversationHandlers.js
import mongoose from "mongoose";
import Conversation from "../models/conversationModel.js";
import UnreadCount from "../models/unreadCountModel.js";
import User from "../models/userModel.js";
import JoinRequest from "../models/joinRequestModel.js";
import { formatConversation } from "../utils/controller-utils/conversationUtils.js";
import { incrementUnreadRequest, resetUnreadRequests } from "../utils/controller-utils/unreadCountUtils.js";

export const registerConversationHandlers = (io, socket) => {

  socket.on("join_conversations_room", () => {
    socket.join(`user_${socket.user.id}`);
  });

  // Reset specific request type dynamically
  socket.on("reset_unread_request", async (type) => {
    try {
      const updated = await resetUnreadRequests(socket.user.id, type);
      io.to(`user_${socket.user.id}`).emit("unread_counts_updated", updated);
    } catch (err) {
      console.error(`Error resetting unread ${type} requests:`, err);
    }
  });

  // Reset unread messages for a conversation
  socket.on("reset_unread_messages", async (conversationId) => {
    try {
      const unread = await UnreadCount.findOne({ user: socket.user.id });

      if (!unread) return;

      unread.unreadMessages = unread.unreadMessages.map((entry) =>
        entry.conversation.toString() === conversationId.toString()
          ? { ...entry.toObject(), count: 0 }
          : entry
      );

      await unread.save();

      io.to(`user_${socket.user.id}`).emit("unread_messages_reset", {
        conversationId,
        unreadCount: 0,
      });
    } catch (err) {
      console.error("Error resetting unread messages:", err);
    }
  });
};

export const incrementUnreadRequestAndEmit = async (io, userId, type) => {
  const updatedCounts = await incrementUnreadRequest(userId, type);

  io.to(`user_${userId}`).emit("unread_counts_updated", updatedCounts);

  return updatedCounts;
};


/**
 * Utility function to emit updated conversation to all participants
 */
export const emitConversationUpdate = async (io, conversationId) => {
  try {
    const convo = await Conversation.findById(conversationId)
      .populate("participants", "name image")
      .lean();

    if (!convo) {
      console.error(`Conversation ${conversationId} not found`);
      return;
    }

    // Emit to each participant's room with user-specific unread count
    for (const user of convo.participants) {
      const formattedConversation = formatConversation(convo, user._id);

      io.to(`user_${user._id}`).emit(
        "conversation_updated",
        formattedConversation
      );

      // console.log(
      //   `Emitted to user_${user._id} for convo ${conversationId}:`,
      //   formattedConversation
      // );
    }
  } catch (err) {
    console.error("Error emitting conversation update:", err);
  }
};
