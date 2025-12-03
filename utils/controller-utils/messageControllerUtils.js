import mongoose from "mongoose";
import Conversation from "../../models/conversationModel.js";
import Message from "../../models/messageModel.js";
import { incrementUnreadRequestAndEmit } from "../../sockets/conversationSocket.js";
import { io } from "../../app.js";

// Helper to validate ObjectId
export const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

// Helper to check if user is a conversation participant
export const isUserInConversation = async (conversationId, userId) => {
  const conversation = await Conversation.findById(conversationId);
  return conversation?.participants.some((p) => p.equals(userId));
};


export const findOrCreateConversation = async (userId, receiverId, conversationId) => {
  let conversation;

  if (!conversationId) {
    // New conversation (1-to-1)
    if (!receiverId || !isValidObjectId(receiverId)) {
      throw new Error("Receiver is required for new conversation");
    }

    conversation = await Conversation.findOne({
      participants: { $all: [userId, receiverId], $size: 2 },
      "group.is_group": false,
    });

    if (!conversation) {
      conversation = await Conversation.create({
        participants: [userId, receiverId],
        visibility: "private",
        group: { is_group: false },
      });
           // Increase unreadFriendRequestCount for the receiver
      await incrementUnreadRequestAndEmit(io, receiverId, "friend");
    }
  } else {
    if (!isValidObjectId(conversationId)) {
      throw new Error("Invalid conversation ID");
    }

    conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      throw new Error("Conversation not found");
    }
  }

  return conversation;
};

export const verifyUserInConversation = async (conversation, userId) => {
  const isParticipant = conversation.participants.some(
    (id) => id.toString() === userId.toString()
  );
  if (!isParticipant) throw new Error("Unauthorized to send message in this conversation");
};

export const computeDeletionTime = (conversation) => {
  const deleteAfterHours = conversation.autoDeleteMessagesAfter;
  // If autoDeleteMessagesAfter is 0 or not set, don't schedule deletion (return null)
  if (!deleteAfterHours || deleteAfterHours <= 0) {
    return null;
  }
  return new Date(Date.now() + deleteAfterHours * 60 * 60 * 1000);
};

export const updateConversationState = async (conversation, senderId, lastText) => {
  // Update last message details
  conversation.last_message = {
    message: lastText,
    sender: senderId,
    timestamp: new Date(),
  };

  // Update unread count for all participants except sender
  conversation.participants.forEach((participantId) => {
    if (participantId.toString() === senderId.toString()) return;

    const existingUnread = conversation.unread_messages.find(
      (um) => um.user.toString() === participantId.toString()
    );

    if (existingUnread) {
      existingUnread.count += 1;
    } else {
      conversation.unread_messages.push({ user: participantId, count: 1 });
    }
  });

  await conversation.save();
};

 // Shared validation and query-building function
export const validateAndBuildQuery = async ({ conversationId, messageId, userId }) => {
  // Validate inputs
  if (
    !mongoose.Types.ObjectId.isValid(conversationId) ||
    !mongoose.Types.ObjectId.isValid(userId)
  ) {
    return { success: false, message: "Invalid conversationId or userId" };
  }

  if (
    messageId &&
    !mongoose.Types.ObjectId.isValid(messageId) 
  ) {
    return {
      success: false,
      message: "Invalid messageId  provided",
    };
  }

  // Build query
  const query = {
    conversation: conversationId,
    $or: [],
  };

  if (messageId && mongoose.Types.ObjectId.isValid(messageId)) {
    query.$or.push({ _id: messageId });
  }

  if (query.$or.length === 0) {
    return {
      success: false,
      message: "No valid messageId or clientTempId provided",
    };
  }

  // Find message
  const message = await Message.findOne(query);
  if (!message) {
    return { success: false, message: "Message not found" };
  }

  return { success: true, message };
};