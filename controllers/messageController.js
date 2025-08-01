import { isValidObjectId } from "mongoose";
import Conversation from "../models/conversationModel.js";
import Message from "../models/messageModel.js";
import mongoose from "mongoose";
import {
  isUserInConversation,
  findOrCreateConversation,
  verifyUserInConversation,
  computeDeletionTime,
  updateConversationState,
} from "../utils/controller-utils/messageControllerUtils.js";

// Helper to map MIME types to schema's media.type enum
const mapMimeTypeToMediaType = (mimeType) => {
  if (!mimeType) return "file";
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  return "file";
};

// Send file and/or text message via API
export const sendFileMessage = async (req, res) => {
  const userId = req?.user?._id;
  const resolvedReceiver = req.body.receiver;
  const resolvedText = req.body.text || null;
  let resolvedConversationId = req.params.conversationId || req.body.conversationId;

  try {
    // Validate userId
    if (!userId || !isValidObjectId(userId)) {
      return res.status(400).json({ message: "Invalid sender ID" });
    }

    // Verify Socket.IO instance
    if (!req.io) {
      console.error("sendFileMessage: Socket.IO instance (req.io) is undefined");
      return res.status(500).json({ message: "Socket.IO not initialized" });
    }

    const conversation = await findOrCreateConversation(
      userId,
      resolvedReceiver,
      resolvedConversationId
    );
    resolvedConversationId = conversation._id.toString(); // Convert ObjectId to string
    console.log("sendFileMessage: Conversation ID:", resolvedConversationId);

    await verifyUserInConversation(conversation, userId);

    const otherParticipant = conversation.participants.find(
      (id) => id.toString() !== userId.toString()
    );
    const finalReceiver = resolvedReceiver || otherParticipant;

    let mediaFiles = [];
    if (req?.files?.length > 0) {
      mediaFiles = req.files.map((file) => ({
        url: file.filename,
        type: mapMimeTypeToMediaType(file.mimetype),
        filename: file.originalname,
        size: file.size,
      }));
    }

    const uniqueTypes = [...new Set(mediaFiles.map((f) => f.type))];
    let messageType = "text";
    if (uniqueTypes.length === 1) messageType = uniqueTypes[0];
    else if (uniqueTypes.length > 1) messageType = "mixed";

    const newMessage = await Message.create({
      sender: userId,
      receiver: finalReceiver,
      conversation: resolvedConversationId,
      text: resolvedText,
      media: mediaFiles,
      messageType,
      scheduledDeletionTime: computeDeletionTime(conversation),
    });

    await updateConversationState(
      conversation,
      userId,
      resolvedText || "[Media]"
    );

    const populatedMessage = await Message.findById(newMessage._id)
      .populate("sender", "username")
      .populate("receiver", "username")
      .populate("replyTo");

    if (!populatedMessage) {
      console.error("sendFileMessage: Failed to populate message", newMessage._id);
      return res.status(500).json({ message: "Failed to populate message" });
    }

    // Emit Socket.IO event
    console.log("sendFileMessage: Emitting receiveMessage to room:", resolvedConversationId);
    req.io.to(resolvedConversationId).emit("receiveMessage", populatedMessage);

    res.status(201).json({
      message: populatedMessage,
      conversationId: resolvedConversationId,
    });
  } catch (error) {
    console.error("sendFileMessage: Error:", error);
    res.status(500).json({ message: error.message || "Server error" });
  }
};

// Send text-only message via Socket.IO (unchanged)
export const sendTextMessage = async ({
  io,
  socket,
  conversationId,
  sender,
  receiver,
  text,
}) => {
  try {
    if(!text) return { success: false, message: "Message can not be empty." };
    // Validate sender
    if (!sender || !isValidObjectId(sender)) {
      socket.emit("sendMessageError", { message: "Invalid sender ID" });
      return { success: false, message: "Invalid sender ID" };
    }

    // Verify Socket.IO instance
    if (!io) {
      console.error("sendTextMessage: Socket.IO instance (io) is undefined");
      socket.emit("sendMessageError", { message: "Socket.IO not initialized" });
      return { success: false, message: "Socket.IO not initialized" };
    }

    const conversation = await findOrCreateConversation(
      sender,
      receiver,
      conversationId
    );
    const resolvedConversationId = conversation._id.toString(); // Convert ObjectId to string
    console.log("sendTextMessage: Conversation ID:", resolvedConversationId);

    await verifyUserInConversation(conversation, sender);

    const otherParticipant = conversation.participants.find(
      (id) => id.toString() !== sender.toString()
    );
    const finalReceiver = receiver || otherParticipant;

    const newMessage = await Message.create({
      sender,
      receiver: finalReceiver,
      text,
      conversation: resolvedConversationId,
      scheduledDeletionTime: computeDeletionTime(conversation),
    });

    await updateConversationState(conversation, sender, text);

    const populatedMessage = await Message.findById(newMessage._id)
      .populate("sender", "username")
      .populate("receiver", "username")
      .populate("replyTo");

    if (!populatedMessage) {
      console.error("sendTextMessage: Failed to populate message", newMessage._id);
      socket.emit("sendMessageError", { message: "Failed to populate message" });
      return { success: false, message: "Failed to populate message" };
    }

    // Emit Socket.IO events
    console.log("sendTextMessage: Emitting receiveMessage to room:", resolvedConversationId);
    io.to(resolvedConversationId).emit("receiveMessage", populatedMessage);
    socket.emit("sendMessageSuccess", {
      message: populatedMessage,
      conversationId: resolvedConversationId,
    });

    return {
      success: true,
      message: populatedMessage,
      conversationId: resolvedConversationId,
    };
  } catch (error) {
    console.error("sendTextMessage: Error:", error);
    socket.emit("sendMessageError", {
      message: error.message || "Server error",
    });
    return { success: false, message: error.message || "Server error" };
  }
};

// Utility to validate emoji data
const validateEmojiData = ({ sender, emojiType, text, htmlEmoji, mediaUrl }) => {
  if (!sender || !isValidObjectId(sender)) {
    return { success: false, message: "Invalid sender ID" };
  }
  if (emojiType === "custom" && (!text || !htmlEmoji || !mediaUrl)) {
    return { success: false, message: "Text, htmlEmoji, and mediaUrl are required for custom emojis" };
  }
  if (emojiType && !["custom", "standard"].includes(emojiType)) {
    return { success: false, message: "Invalid emojiType" };
  }
  return { success: true };
};

// Utility to emit Socket.IO events
const emitSocketEvents = ({ io, socket, conversationId, message, result, errorMessage }) => {
  if (errorMessage && !result.success) {
    if (socket) {
      socket.emit("sendMessageError", { message: errorMessage });
    }
    return;
  }
  io.to(conversationId).emit("receiveMessage", message);
  if (socket) {
    socket.emit("sendMessageSuccess", result);
  }
};

// Shared logic for sending emojis
const sendEmojiCore = async ({
  sender,
  receiver,
  conversationId,
  text,
  htmlEmoji,
  emojiType,
  mediaUrl,
}) => {
  console.log("sendEmojiCore input:", { sender, receiver, conversationId, text, htmlEmoji, emojiType, mediaUrl });
  const validation = validateEmojiData({ sender, emojiType, text, htmlEmoji, mediaUrl });
  if (!validation.success) {
    return validation;
  }

  try {
    const conversation = await findOrCreateConversation(sender, receiver, conversationId);
    const resolvedConversationId = conversation._id.toString();

    await verifyUserInConversation(conversation, sender);

    const resolvedReceiver = receiver || conversation.participants.find(
      (id) => id.toString() !== sender.toString()
    );

    const newMessage = await Message.create({
      sender,
      receiver: resolvedReceiver,
      conversation: resolvedConversationId,
      text: text || htmlEmoji || "",
      messageType: "text",
      htmlEmoji: htmlEmoji || null,
      emojiType: emojiType || null,
      media: emojiType === "custom" ? [{ url: mediaUrl, type: "image" }] : [],
      scheduledDeletionTime: computeDeletionTime(conversation),
    });

    await updateConversationState(conversation, sender, text || htmlEmoji || "[Emoji]");

    const populatedMessage = await Message.findById(newMessage._id)
      .populate("sender", "username")
      .populate("receiver", "username")
      .populate("replyTo");

    if (!populatedMessage) {
      return { success: false, message: "Failed to populate message" };
    }

    return {
      success: true,
      message: populatedMessage,
      conversationId: resolvedConversationId,
    };
  } catch (error) {
    console.error("sendEmojiCore error:", error.message);
    return { success: false, message: error.message || "Server error" };
  }
};

// Controller for Socket.IO
export const handleSendEmojiSocket = async ({
  userId: sender,
  conversationId,
  receiver,
  data,
  socket,
  io,
}) => {
  if (!io) {
    console.error("handleSendEmojiSocket: Socket.IO instance missing");
    return { success: false, message: "Socket.IO not initialized" };
  }

  let parsedData;
  try {
    parsedData = JSON.parse(data);
  } catch (error) {
    console.error("handleSendEmojiSocket: Failed to parse data:", data);
    return { success: false, message: "Invalid emoji data format" };
  }

  const { text, htmlEmoji, emojiType, mediaUrl } = parsedData;
  const result = await sendEmojiCore({
    sender,
    receiver,
    conversationId,
    text,
    htmlEmoji,
    emojiType,
    mediaUrl,
  });

  emitSocketEvents({
    io,
    socket,
    conversationId: result.conversationId,
    message: result.message,
    result,
    errorMessage: result.message,
  });

  return result;
};

// Controller for API
export const handleSendEmojiApi = async (req, res) => {
  const sender = req.user._id;
  const { receiver, text, htmlEmoji, emojiType, mediaUrl } = req.body;
  const conversationId = req.params.conversationId || req.body.conversationId;
  const { io, socket } = req;

  if (!io) {
    console.error("handleSendEmojiApi: Socket.IO instance missing");
    return res.status(500).json({ success: false, message: "Socket.IO not initialized" });
  }

  const result = await sendEmojiCore({
    sender,
    receiver,
    conversationId,
    text,
    htmlEmoji,
    emojiType,
    mediaUrl,
  });

  emitSocketEvents({
    io,
    socket,
    conversationId: result.conversationId,
    message: result.message,
    result,
    errorMessage: result.message,
  });

  return res.status(result.success ? 201 : 400).json(result);
};

// Handle Read Messages Event
export const markMessagesAsRead = async (conversationId, userId, io) => {
  try {
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) return;

    const unreadMessage = conversation.unread_messages.find(
      (um) => um.user.toString() === userId
    );
    if (unreadMessage) {
      unreadMessage.count = 0;
    }

    await conversation.save();

    io.to(conversationId).emit("messagesRead", {
      conversationId,
      userId,
    });
  } catch (error) {
    console.error("Error marking messages as read:", error);
  }
};

// Edit a message
export const editMessage = async (req, res) => {
  const { messageId } = req.params;
  const { text } = req.body;
  const userId = req.user._id;

  try {
    if (!isValidObjectId(messageId)) {
      return res.status(400).json({ message: "Invalid message ID" });
    }

    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({ message: "Message not found" });
    }

    // Check if user is the sender
    if (message.sender.toString() !== userId.toString()) {
      return res
        .status(403)
        .json({ message: "Unauthorized to edit this message" });
    }

    // Only text messages can be edited
    if (message.messageType !== "text") {
      return res
        .status(400)
        .json({ message: "Only text messages can be edited" });
    }

    // Update message
    message.text = text;
    message.edited = true;
    message.editHistory.push({ text: message.text, editedAt: new Date() });
    await message.save();

    // Emit edited message to conversation room
    req.io.to(message.conversation.toString()).emit("messageEdited", message);

    res.status(200).json(message);
  } catch (error) {
    console.error("Error editing message:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// Delete a message (soft delete)
export const deleteMessage = async ({
  io,
  socket,
  messageId,
  userId,
  req,
  res,
}) => {
  try {
    if (!isValidObjectId(messageId)) {
      if (res) return res.status(400).json({ message: "Invalid message ID" });
      socket.emit("deleteMessageError", { message: "Invalid message ID" });
      return { success: false, message: "Invalid message ID" };
    }

    const message = await Message.findById(messageId);
    if (!message) {
      if (res) return res.status(404).json({ message: "Message not found" });
      socket.emit("deleteMessageError", { message: "Message not found" });
      return { success: false, message: "Message not found" };
    }

    if (
      !(await isUserInConversation(message.conversation.toString(), userId))
    ) {
      if (res)
        return res
          .status(403)
          .json({ message: "Unauthorized to delete this message" });
      socket.emit("deleteMessageError", {
        message: "Unauthorized to delete this message",
      });
      return { success: false, message: "Unauthorized to delete this message" };
    }

    let hardDelete = false;

    if (message.sender.toString() === userId.toString()) {
      // Hard delete if the requester is the message owner
      await Message.findByIdAndDelete(messageId);
      hardDelete = true;
    } else {
      // Soft delete for non-owners
      if (!message.deletedBy.includes(userId)) {
        message.deletedBy.push(userId);
        await message.save();
      }
    }

    // Emit messageDeleted event with hardDelete flag
    io.to(message.conversation.toString()).emit("messageDeleted", {
      messageId,
      userId,
      hardDelete,
    });

    if (res) {
      res
        .status(200)
        .json({ message: "Message deleted successfully", hardDelete });
      return { success: true, hardDelete };
    }

    return {
      success: true,
      message: "Message deleted successfully",
      hardDelete,
    };
  } catch (error) {
    console.error("Error deleting message:", error);
    if (res) return res.status(500).json({ message: "Server error" });
    socket.emit("deleteMessageError", { message: "Server error" });
    return { success: false, message: "Server error" };
  }
};

// Reply to a message
export const replyMessage = async (req, res) => {
  const { conversationId, messageId } = req.params;
  const { text, messageType = "reply" } = req.body;
  const sender = req.user._id;
  let receiver = req.body.receiver;

  try {
    // Validate conversation and message
    if (!isValidObjectId(conversationId) || !isValidObjectId(messageId)) {
      return res
        .status(400)
        .json({ message: "Invalid conversation or message ID" });
    }

    if (!(await isUserInConversation(conversationId, sender))) {
      return res
        .status(403)
        .json({ message: "Unauthorized to reply in this conversation" });
    }

    const originalMessage = await Message.findById(messageId);
    if (!originalMessage) {
      return res.status(404).json({ message: "Original message not found" });
    }

    // Create reply message
    const newMessage = new Message({
      conversation: conversationId,
      sender,
      receiver: receiver ? (isValidObjectId(receiver) ? receiver : null) : null,
      text,
      messageType,
      replyTo: messageId,
    });

    await newMessage.save();

    // Update conversation
    const conversation = await Conversation.findById(conversationId);
    if (conversation) {
      conversation.last_message = {
        message: text,
        sender,
        timestamp: new Date(),
      };

      conversation.participants.forEach((participant) => {
        if (participant.toString() !== sender.toString()) {
          const unreadMessage = conversation.unread_messages.find(
            (um) => um.user.toString() === participant.toString()
          );
          if (unreadMessage) {
            unreadMessage.count += 1;
          } else {
            conversation.unread_messages.push({ user: participant, count: 1 });
          }
        }
      });

      await conversation.save();
    }

    // Populate and emit
    const populatedMessage = await Message.findById(newMessage._id)
      .populate("sender", "username")
      .populate("receiver", "username")
      .populate("replyTo");

    req.io.to(conversationId).emit("receiveMessage", populatedMessage);

    res.status(201).json(populatedMessage);
  } catch (error) {
    console.error("Error replying to message:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// Get messages with pagination
export const getMessages = async (req, res) => {
  const { conversationId } = req.params;
  const { userId, page = 1, limit = 20 } = req.query;
  try {
    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);

    if (!isValidObjectId(conversationId)) {
      return res.status(400).json({ message: "Invalid conversation ID" });
    }

    if (!userId || !(await isUserInConversation(conversationId, userId))) {
      return res
        .status(403)
        .json({ message: "Unauthorized to view this conversation" });
    }

    const messages = await Message.find({
      conversation: conversationId,
      deletedBy: { $ne: userId }, // Exclude messages soft-deleted by the user
    })
      .populate("sender", "username")
      .populate("receiver", "username")
      .populate("replyTo")
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum);

    const totalMessages = await Message.countDocuments({
      conversation: conversationId,
      deletedBy: { $ne: userId }, // Count only non-soft-deleted messages
    });

    return res.status(200).json({
      messages,
      totalPages: Math.ceil(totalMessages / limitNum),
      currentPage: pageNum,
    });
  } catch (error) {
    console.error("Error fetching messages:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

export const getConversationImages = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { cursor, limit = 20, direction = "older", skip } = req.query;

    const parsedLimit = Math.min(Number(limit) || 20, 50); // Max 50 per page

    const query = {
      conversation: conversationId,
      messageType: "image",
      $or: [{ emojiType: { $exists: false } }, { emojiType: null }],
    };
    let sortOrder = direction === "older" ? -1 : 1;

    if (cursor) {
      const cursorDate = new Date(Number(cursor));
      query.createdAt =
        direction === "older" ? { $lt: cursorDate } : { $gt: cursorDate };
    }

    if (skip) {
      // Simulate offset by fetching messages and skipping
      const skipCount = Number(skip) || 0;
      const messagesBeforeSkip = await Message.find(query)
        .sort({ createdAt: sortOrder })
        .limit(skipCount)
        .lean();

      if (messagesBeforeSkip.length === skipCount) {
        // Use the last message's createdAt as the cursor
        const lastMessage = messagesBeforeSkip[messagesBeforeSkip.length - 1];
        query.createdAt =
          direction === "older"
            ? { $lt: new Date(lastMessage.createdAt) }
            : { $gt: new Date(lastMessage.createdAt) };
      } else {
        // If skip exceeds available messages, return empty result
        return res.status(200).json({
          images: [],
          nextCursor: null,
          hasMore: false,
        });
      }
    }

    const messages = await Message.find(query)
      .sort({ createdAt: sortOrder })
      .limit(parsedLimit)
      .lean();

    const normalizedMessages =
      direction === "older" ? messages.reverse() : messages;

    res.status(200).json({
      images: normalizedMessages.map((msg) => ({
        _id: msg._id,
        createdAt: msg.createdAt,
        media: msg.media.filter((m) => m.type === "image"),
        sender: msg.sender,
      })),
      nextCursor:
        normalizedMessages.length > 0
          ? new Date(
              normalizedMessages[normalizedMessages.length - 1].createdAt
            ).getTime()
          : null,
      hasMore: normalizedMessages.length === parsedLimit,
    });
  } catch (error) {
    console.error("Error fetching conversation images:", error);
    res.status(500).json({ message: "Failed to load images" });
  }
};

// Mark messages as read
// const markMessagesAsRead = async (req, res) => {
//   const { conversationId } = req.params;
//   const userId = req.user._id;

//   try {
//     if (!isValidObjectId(conversationId)) {
//       return res.status(400).json({ message: "Invalid conversation ID" });
//     }

//     if (!(await isUserInConversation(conversationId, userId))) {
//       return res.status(403).json({ message: "Unauthorized to mark messages as read" });
//     }

//     // Mark messages as read
//     await Message.updateMany(
//       { conversation: conversationId, readBy: { $ne: { user: userId } } },
//       { $push: { readBy: { user: userId, readAt: new Date() } } }
//     );

//     // Reset unread count in conversation
//     const conversation = await Conversation.findById(conversationId);
//     if (conversation) {
//       const unreadMessage = conversation.unread_messages.find(
//         (um) => um.user.toString() === userId.toString()
//       );
//       if (unreadMessage) {
//         unreadMessage.count = 0;
//         await conversation.save();
//       }
//     }

//     // Emit read event
//     req.io.to(conversationId).emit("messagesRead", { conversationId, userId });

//     res.status(200).json({ message: "Messages marked as read" });
//   } catch (error) {
//     console.error("Error marking messages as read:", error);
//     res.status(500).json({ message: "Server error" });
//   }
// };
