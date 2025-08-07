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
  const clientTempId = req.body.clientTempId; // Extract clientTempId from FormData
  let resolvedConversationId =
    req.params.conversationId || req.body.conversationId;

  try {
    // Validate userId
    if (!userId || !isValidObjectId(userId)) {
      return res.status(400).json({ message: "Invalid sender ID" });
    }

    // Verify Socket.IO instance
    if (!req.io) {
      console.error(
        "sendFileMessage: Socket.IO instance (req.io) is undefined"
      );
      return res.status(500).json({ message: "Socket.IO not initialized" });
    }

    const conversation = await findOrCreateConversation(
      userId,
      resolvedReceiver,
      resolvedConversationId
    );
    resolvedConversationId = conversation._id.toString();
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
      status: "sent", // Ensure status is set
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
      console.error(
        "sendFileMessage: Failed to populate message",
        newMessage._id
      );
      return res.status(500).json({ message: "Failed to populate message" });
    }

    // Add clientTempId to the response object (not stored in DB)
    const responseMessage = {
      ...populatedMessage.toObject(),
      clientTempId, // Include clientTempId in response
    };

    // Emit Socket.IO event
    console.log(
      "sendFileMessage: Emitting receiveMessage to room:",
      resolvedConversationId
    );
    req.io.to(resolvedConversationId).emit("receiveMessage", responseMessage);

    res.status(201).json({
      message: responseMessage,
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
  clientTempId, // Ensure clientTempId is received
}) => {
  try {
    if (!text) {
      socket.emit("sendMessageError", {
        message: "Message cannot be empty",
        clientTempId,
      });
      return { success: false, message: "Message cannot be empty" };
    }
    // Validate sender
    if (!sender || !isValidObjectId(sender)) {
      socket.emit("sendMessageError", {
        message: "Invalid sender ID",
        clientTempId,
      });
      return { success: false, message: "Invalid sender ID" };
    }

    // Verify Socket.IO instance
    if (!io) {
      console.error("sendTextMessage: Socket.IO instance (io) is undefined");
      socket.emit("sendMessageError", {
        message: "Socket.IO not initialized",
        clientTempId,
      });
      return { success: false, message: "Socket.IO not initialized" };
    }

    const conversation = await findOrCreateConversation(
      sender,
      receiver,
      conversationId
    );
    const resolvedConversationId = conversation._id.toString();

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
      messageType: "text", // Explicitly set messageType
      status: "sent", // Ensure status is set
      scheduledDeletionTime: computeDeletionTime(conversation),
    });

    await updateConversationState(conversation, sender, text);

    const populatedMessage = await Message.findById(newMessage._id)
      .populate("sender", "username")
      .populate("receiver", "username")
      .populate("replyTo");

    if (!populatedMessage) {
      console.error(
        "sendTextMessage: Failed to populate message",
        newMessage._id
      );
      socket.emit("sendMessageError", {
        message: "Failed to populate message",
        clientTempId,
      });
      return { success: false, message: "Failed to populate message" };
    }

    // Add clientTempId to the response object (not stored in DB)
    const responseMessage = {
      ...populatedMessage.toObject(),
      clientTempId, // Include clientTempId in response
    };

    // Emit Socket.IO events
    console.log(
      "sendTextMessage: Emitting receiveMessage to room:",
      responseMessage
    );
    io.to(resolvedConversationId).emit("receiveMessage", responseMessage);
    socket.emit("sendMessageSuccess", {
      message: responseMessage,
      conversationId: resolvedConversationId,
    });

    return {
      success: true,
      message: responseMessage,
      conversationId: resolvedConversationId,
    };
  } catch (error) {
    console.error("sendTextMessage: Error:", error);
    socket.emit("sendMessageError", {
      message: error.message || "Server error",
      clientTempId, // Include clientTempId in error response
    });
    return { success: false, message: error.message || "Server error" };
  }
};

// Utility to validate emoji data
// Utility to validate emoji data
const validateEmojiData = ({
  sender,
  emojiType,
  text,
  htmlEmoji,
  mediaUrl,
}) => {
  if (!sender || !isValidObjectId(sender)) {
    return { success: false, message: "Invalid sender ID" };
  }
  if (emojiType === "custom" && (!text || !htmlEmoji || !mediaUrl)) {
    return {
      success: false,
      message: "Text, htmlEmoji, and mediaUrl are required for custom emojis",
    };
  }
  if (emojiType && !["custom", "standard"].includes(emojiType)) {
    return { success: false, message: "Invalid emojiType" };
  }
  return { success: true };
};

// Utility to emit Socket.IO events
const emitSocketEvents = ({
  io,
  socket,
  conversationId,
  message,
  result,
  errorMessage,
  clientTempId,
}) => {
  if (errorMessage && !result.success) {
    if (socket) {
      socket.emit("sendMessageError", { message: errorMessage, clientTempId }); // Include clientTempId in error
    }
    return;
  }
  io.to(conversationId).emit("receiveMessage", message);
  if (socket) {
    socket.emit("sendMessageSuccess", { ...result, clientTempId }); // Include clientTempId in success
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
  clientTempId, // Add clientTempId
}) => {
  console.log("sendEmojiCore input:", {
    sender,
    receiver,
    conversationId,
    text,
    htmlEmoji,
    emojiType,
    mediaUrl,
  });
  const validation = validateEmojiData({
    sender,
    emojiType,
    text,
    htmlEmoji,
    mediaUrl,
  });
  if (!validation.success) {
    return { ...validation, clientTempId }; // Include clientTempId in error response
  }

  try {
    const conversation = await findOrCreateConversation(
      sender,
      receiver,
      conversationId
    );
    const resolvedConversationId = conversation._id.toString();

    await verifyUserInConversation(conversation, sender);

    const resolvedReceiver =
      receiver ||
      conversation.participants.find(
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
      media:
        emojiType === "custom"
          ? [{ url: mediaUrl, type: "image", filename: text || "emoji" }]
          : [],
      status: "sent", // Ensure status is set
      scheduledDeletionTime: computeDeletionTime(conversation),
    });

    await updateConversationState(
      conversation,
      sender,
      text || htmlEmoji || "[Emoji]"
    );

    const populatedMessage = await Message.findById(newMessage._id)
      .populate("sender", "username")
      .populate("receiver", "username")
      .populate("replyTo");

    if (!populatedMessage) {
      return {
        success: false,
        message: "Failed to populate message",
        clientTempId,
      };
    }

    // Add clientTempId to the response object (not stored in DB)
    const responseMessage = {
      ...populatedMessage.toObject(),
      clientTempId,
    };

    return {
      success: true,
      message: responseMessage,
      conversationId: resolvedConversationId,
      clientTempId, // Include clientTempId in return
    };
  } catch (error) {
    console.error("sendEmojiCore error:", error.message);
    return {
      success: false,
      message: error.message || "Server error",
      clientTempId,
    };
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
  clientTempId, // Add clientTempId
}) => {
  if (!io) {
    console.error("handleSendEmojiSocket: Socket.IO instance missing");
    return {
      success: false,
      message: "Socket.IO not initialized",
      clientTempId,
    };
  }

  let parsedData;
  try {
    parsedData = JSON.parse(data);
  } catch (error) {
    console.error("handleSendEmojiSocket: Failed to parse data:", data);
    return {
      success: false,
      message: "Invalid emoji data format",
      clientTempId,
    };
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
    clientTempId, // Pass clientTempId
  });

  emitSocketEvents({
    io,
    socket,
    conversationId: result.conversationId,
    message: result.message,
    result,
    errorMessage: result.message,
    clientTempId, // Pass clientTempId
  });

  return result;
};
export const handleSendEmojiApi = async (req, res) => {
  const sender = req.user._id;
  const { receiver, text, htmlEmoji, emojiType, mediaUrl } = req.body;
  const conversationId = req.params.conversationId || req.body.conversationId;
  const { io, socket } = req;

  if (!io) {
    console.error("handleSendEmojiApi: Socket.IO instance missing");
    return res
      .status(500)
      .json({ success: false, message: "Socket.IO not initialized" });
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
    // Validate inputs
    if (!conversationId || !isValidObjectId(conversationId)) {
      console.error("markMessagesAsRead: Invalid conversation ID");
      if (io)
        io.to(conversationId).emit("messageReadError", {
          message: "Invalid conversation ID",
        });
      return;
    }
    if (!userId || !isValidObjectId(userId)) {
      console.error("markMessagesAsRead: Invalid user ID");
      if (io)
        io.to(conversationId).emit("messageReadError", {
          message: "Invalid user ID",
        });
      return;
    }
    if (!io) {
      console.error("markMessagesAsRead: Socket.IO instance (io) is undefined");
      return;
    }

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      console.error("markMessagesAsRead: Conversation not found");
      io.to(conversationId).emit("messageReadError", {
        message: "Conversation not found",
      });
      return;
    }

    // Verify user is a participant
    await verifyUserInConversation(conversation, userId);

    // Update unread_messages count in Conversation
    const unreadMessage = conversation.unread_messages.find(
      (um) => um.user.toString() === userId
    );
    if (unreadMessage) {
      unreadMessage.count = 0;
      await conversation.save();
    }

    // Update Message documents: add userId to readBy for valid, non-deleted messages
    const updatedMessages = await Message.updateMany(
      {
        conversation: conversationId,
        receiver: userId,
        "readBy.user": { $ne: userId }, // Not already read by user
        deletedBy: { $nin: [userId] }, // Not deleted by user
        $or: [
          { text: { $exists: true, $ne: "" } },
          { media: { $exists: true, $ne: [] } },
          { voice: { $exists: true } },
          { call: { $exists: true } },
          { img: { $exists: true } },
        ],
      },
      {
        $addToSet: { readBy: { user: userId, readAt: new Date() } },
        $set: { status: "delivered" },
      },
      { new: true }
    );

    // Get IDs of updated messages
    const messageIds = (
      await Message.find({
        conversation: conversationId,
        receiver: userId,
        "readBy.user": userId,
        deletedBy: { $nin: [userId] }, // Not deleted by user
        $or: [
          { text: { $exists: true, $ne: "" } },
          { media: { $exists: true, $ne: [] } },
          { voice: { $exists: true } },
          { call: { $exists: true } },
          { img: { $exists: true } },
        ],
      }).select("_id")
    ).map((msg) => msg._id.toString());

    // Log for debugging
    // console.log(`markMessagesAsRead: Emitting messagesRead for conversation ${conversationId}, user ${userId}, messageIds:`, messageIds);

    // Emit messagesRead event only if there are valid message IDs
    if (messageIds.length > 0) {
      io.to(conversationId).emit("messagesRead", {
        conversationId,
        userId,
        messageIds,
      });
    } else {
      console.log(
        // `markMessagesAsRead: No valid messages to mark as read for conversation ${conversationId}, user ${userId}`
      );
    }
  } catch (error) {
    console.error("Error marking messages as read:", error);
    if (io)
      io.to(conversationId).emit("messageReadError", {
        message: error.message || "Server error",
      });
  }
};

// Shared logic for editing messages
const editMessageCore = async ({
  messageId,
  sender,
  text,
  htmlEmoji,
  emojiType,
  clientTempId,
}) => {
  try {
    if (!isValidObjectId(messageId)) {
      return { success: false, message: "Invalid message ID", clientTempId };
    }

    const message = await Message.findById(messageId);
    if (!message) {
      return { success: false, message: "Message not found", clientTempId };
    }

    // Check if user is the sender
    if (message.sender.toString() !== sender.toString()) {
      return {
        success: false,
        message: "Unauthorized to edit this message",
        clientTempId,
      };
    }

    // Only text messages can be edited
    if (message.messageType !== "text") {
      return {
        success: false,
        message: "Only text messages can be edited",
        clientTempId,
      };
    }

    // Validate emoji data if provided
    if (emojiType) {
      const validation = validateEmojiData({
        sender,
        emojiType,
        text,
        htmlEmoji,
        mediaUrl: message.media[0]?.url,
      });
      if (!validation.success) {
        return { success: false, message: validation.message, clientTempId };
      }
    }

    // Store current state in editHistory
    if (message.text || message.htmlEmoji) {
      message.editHistory.push({
        text: message.text,
        htmlEmoji: message.htmlEmoji,
        emojiType: message.emojiType,
        editedAt: new Date(),
      });
    }

    // Update message fields
    if (text !== undefined) message.text = text;
    if (htmlEmoji !== undefined) message.htmlEmoji = htmlEmoji || null;
    if (emojiType !== undefined) message.emojiType = emojiType || null;
    message.edited = true;

    await message.save();

    // Populate message
    const populatedMessage = await Message.findById(messageId)
      .populate("sender", "username")
      .populate("receiver", "username")
      .populate("replyTo");

    if (!populatedMessage) {
      return {
        success: false,
        message: "Failed to populate message",
        clientTempId,
      };
    }

    // Add clientTempId to response
    const responseMessage = {
      ...populatedMessage.toObject(),
      clientTempId,
    };

    return {
      success: true,
      message: responseMessage,
      conversationId: message.conversation.toString(),
      clientTempId,
    };
  } catch (error) {
    console.error("editMessageCore: Error:", error);
    return {
      success: false,
      message: error.message || "Server error",
      clientTempId,
    };
  }
};

// Edit a message
export const editMessage = async (req, res) => {
  const { messageId } = req.params;
  const { text, htmlEmoji, emojiType, clientTempId } = req.body;
  const sender = req.user._id;

  // Verify Socket.IO instance
  if (!req.io) {
    console.error("editMessage: Socket.IO instance (req.io) is undefined");
    return res
      .status(500)
      .json({ message: "Socket.IO not initialized", clientTempId });
  }

  const result = await editMessageCore({
    messageId,
    sender,
    text,
    htmlEmoji,
    emojiType,
    clientTempId,
  });

  if (!result.success) {
    return res.status(400).json({ message: result.message, clientTempId });
  }

  req.io.to(result.conversationId).emit("messageEdited", result.message);

  res.status(200).json({
    message: result.message,
    clientTempId,
  });
};

// Handle edit message via Socket.IO
export const handleEditMessageSocket = async ({
  io,
  socket,
  messageId,
  text,
  htmlEmoji,
  emojiType,
  clientTempId,
}) => {
  if (!io) {
    console.error(
      "handleEditMessageSocket: Socket.IO instance (io) is undefined"
    );
    socket.emit("editMessageError", {
      message: "Socket.IO not initialized",
      clientTempId,
    });
    return {
      success: false,
      message: "Socket.IO not initialized",
      clientTempId,
    };
  }
  const sender = socket.user.id;
  console.log('sender', sender)
  const result = await editMessageCore({
    messageId,
    sender,
    text,
    htmlEmoji,
    emojiType,
    clientTempId,
  });

  if (!result.success) {
    socket.emit("editMessageError", { message: result.message, clientTempId });
    return result;
  }

  io.to(result.conversationId).emit("messageEdited", result.message);
  socket.emit("editMessageSuccess", {
    message: result.message,
    conversationId: result.conversationId,
    clientTempId,
  });

  return result;
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

// Shared logic for sending reply messages
const sendReplyCore = async ({
  sender,
  conversationId,
  messageId,
  text,
  messageType = "reply",
  htmlEmoji,
  emojiType,
  media = [],
  clientTempId,
}) => {
  try {
    if (!isValidObjectId(conversationId) || !isValidObjectId(messageId)) {
      return {
        success: false,
        message: "Invalid conversation or message ID",
        clientTempId,
      };
    }

    if (!sender || !isValidObjectId(sender)) {
      return { success: false, message: "Invalid sender ID", clientTempId };
    }

    if (!(await isUserInConversation(conversationId, sender))) {
      return {
        success: false,
        message: "Unauthorized to reply in this conversation",
        clientTempId,
      };
    }

    const originalMessage = await Message.findById(messageId);
    if (!originalMessage) {
      return {
        success: false,
        message: "Original message not found",
        clientTempId,
      };
    }

    let finalMessageType = messageType;
    let mediaFiles = media;

    if (media?.length > 0) {
      mediaFiles = media.map((file) => ({
        url: file.url || file.filename,
        type: mapMimeTypeToMediaType(file.mimetype),
        filename: file.originalname || file.filename,
        size: file.size,
      }));
      const uniqueTypes = [...new Set(mediaFiles.map((f) => f.type))];
      finalMessageType = uniqueTypes.length === 1 ? uniqueTypes[0] : "mixed";
    } else if (htmlEmoji && emojiType) {
      finalMessageType = "text";
    }

    if (emojiType) {
      const validation = validateEmojiData({
        sender,
        emojiType,
        text,
        htmlEmoji,
        mediaUrl: mediaFiles[0]?.url,
      });
      if (!validation.success) {
        return { success: false, message: validation.message, clientTempId };
      }
    }

    const conversation = await Conversation.findById(conversationId);

    const newMessage = await Message.create({
      conversation: conversationId,
      sender,
      text: typeof text === "string" && text.trim() !== "" ? text : htmlEmoji || null,
      messageType: finalMessageType,
      media: mediaFiles,
      htmlEmoji: htmlEmoji || null,
      emojiType: emojiType || null,
      replyTo: messageId,
      status: "sent",
      scheduledDeletionTime: computeDeletionTime(conversation),
    });

    if (conversation) {
      conversation.last_message = {
        message: typeof text === "string" && text.trim() !== "" ? text : htmlEmoji || "[Media]",
        sender,
        timestamp: new Date(),
      };

      conversation.participants.forEach((participant) => {
        if (participant.toString() !== sender.toString()) {
          const unread = conversation.unread_messages.find(
            (u) => u.user.toString() === participant.toString()
          );
          if (unread) {
            unread.count += 1;
          } else {
            conversation.unread_messages.push({ user: participant, count: 1 });
          }
        }
      });

      await conversation.save();
    }

    const populatedMessage = await Message.findById(newMessage._id)
      .populate("sender", "username")
      .populate("replyTo", "_id text messageType media")
      .lean();

    if (populatedMessage?.replyTo) {
      populatedMessage.replyTo = {
        _id: populatedMessage.replyTo._id,
        text: populatedMessage.replyTo.text,
        messageType: populatedMessage.replyTo.messageType,
        media: populatedMessage.replyTo.media,
      };
    }

    if (!populatedMessage) {
      console.error("sendReplyCore: Failed to populate message", newMessage._id);
      return {
        success: false,
        message: "Failed to populate message",
        clientTempId,
      };
    }

    const responseMessage = {
      ...populatedMessage,
      clientTempId,
    };

    return {
      success: true,
      message: responseMessage,
      conversationId,
      clientTempId,
    };
  } catch (error) {
    console.error("sendReplyCore: Error:", error);
    return {
      success: false,
      message: error.message || "Server error",
      clientTempId,
    };
  }
};

// Reply to a message
export const replyMessage = async (req, res) => { 
  const { conversationId, messageId } = req.params;
  const {
    text,
    messageType = "reply",
    htmlEmoji,
    emojiType,
    clientTempId,
  } = req.body;
  const sender = req.user._id;
  console.log("text", clientTempId);
  // Verify Socket.IO instance
  if (!req.io) {
    console.error("replyMessage: Socket.IO instance (req.io) is undefined");
    return res
      .status(500)
      .json({ message: "Socket.IO not initialized", clientTempId });
  }

  // Handle media files if present
  let mediaFiles = [];
  if (req?.files?.length > 0) {
    mediaFiles = req.files.map((file) => ({
      url: file.filename,
      type: mapMimeTypeToMediaType(file.mimetype),
      filename: file.originalname,
      size: file.size,
    }));
  }

  const result = await sendReplyCore({
    sender,
    conversationId,
    messageId,
    text,
    messageType,
    htmlEmoji,
    emojiType,
    media: mediaFiles,
    clientTempId,
  });

  if (!result.success) {
    return res.status(400).json({ message: result.message, clientTempId });
  }

  req.io.to(conversationId).emit("receiveMessage", result.message);

  res.status(201).json({
    message: result.message,
    conversationId,
    clientTempId,
  });
};

// Handle reply message via Socket.IO
export const handleSendReplySocket = async ({
  io,
  socket,
  conversationId,
  messageId,
  text,
  messageType = "reply",
  htmlEmoji,
  emojiType,
  media,
  clientTempId,
}) => {
  if (!io) {
    console.error(
      "handleSendReplySocket: Socket.IO instance (io) is undefined"
    );
    socket.emit("sendMessageError", {
      message: "Socket.IO not initialized",
      clientTempId,
    });
    return {
      success: false,
      message: "Socket.IO not initialized",
      clientTempId,
    };
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
    media,
    clientTempId,
  });

  if (!result.success) {
    socket.emit("sendMessageError", { message: result.message, clientTempId });
    return result;
  }

  io.to(conversationId).emit("receiveMessage", result.message);
  socket.emit("sendMessageSuccess", {
    message: result.message,
    conversationId,
    clientTempId,
  });

  return result;
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
      .populate("replyTo", "_id text messageType media")
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
