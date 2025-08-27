import mongoose from "mongoose";
import Conversation from "../models/conversationModel.js";
import User from "../models/userModel.js";
import JoinRequest from "../models/joinRequestModel.js";
import { formatConversation } from "../utils/controller-utils/conversationUtils.js";

// registerConversationHandlers will be called inside initSocketServer
export const registerConversationHandlers = (io, socket) => {
  console.log("Conversation socket registered for:", socket.user.id);

  // Join the user's personal room (so we can target updates to them)
  socket.on("join_conversations_room", () => {
    socket.join(`user_${socket.user.id}`);
    console.log(`User ${socket.user.id} joined room: user_${socket.user.id}`);
  });
};

// Utility function to emit updated conversation to all participants
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
    convo.participants.forEach((user) => {
      const formattedConversation = formatConversation(convo, user._id);

      // Emit to this user's room
      io.to(`user_${user._id}`).emit("conversation_updated", formattedConversation);
      console.log(`Emitted to user_${user._id} for convo ${conversationId}:`, formattedConversation);
    });
  } catch (err) {
    console.error("Error emitting conversation update:", err);
  }
};