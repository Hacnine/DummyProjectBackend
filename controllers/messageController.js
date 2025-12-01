import { isValidObjectId } from "mongoose";
import Conversation from "../models/conversationModel.js";
import Message from "../models/messageModel.js";
import User from "../models/userModel.js";
import fs from "fs";
import path from "path";

import {
  isUserInConversation,
  findOrCreateConversation,
  verifyUserInConversation,
  computeDeletionTime,
  updateConversationState,
  validateAndBuildQuery,
} from "../utils/controller-utils/messageControllerUtils.js";
import mongoose from "mongoose";
import { emitConversationUpdate } from "../sockets/conversationSocket.js";
import { 
  enhanceMessageWithZeroKnowledgeEncryption,
  shouldMessageBeEncrypted,
  logEncryptionActivity 
} from "../services/zeroKnowledgeEncryptionService.js";
import {
  encryptMessage as backendEncrypt,
  decryptMessage as backendDecrypt,
  isBackendEncrypted
} from "../services/backendEncryptionService.js";

// Helper to map MIME types to schema's media.type enum
const mapMimeTypeToMediaType = (mimeType) => {
  if (!mimeType) return "file";
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  return "file";
};

/**
 * Helper to handle backend encryption for messages
 * If text is marked for backend encryption (has special marker), encrypt it
 * @param {string} text - Message text
 * @returns {Promise<Object>} - { text, isBackendEncrypted }
 */
async function handleBackendEncryption(text) {
  if (!text || typeof text !== 'string') {
    return { text, isBackendEncrypted: false };
  }
  
  // Check if text is marked for backend encryption
  // Frontend sends: "__BACKEND_ENCRYPT__:actualMessage"
  if (text.startsWith('__BACKEND_ENCRYPT__:')) {
    const actualMessage = text.substring('__BACKEND_ENCRYPT__:'.length);
    const encrypted = await backendEncrypt(actualMessage);
    return { text: encrypted, isBackendEncrypted: true };
  }
  
  // Check if already backend encrypted
  if (isBackendEncrypted(text)) {
    return { text, isBackendEncrypted: true };
  }
  
  // Plain text or frontend encrypted
  return { text, isBackendEncrypted: false };
}

/**
 * Helper to handle backend decryption for messages
 * @param {string} text - Message text
 * @returns {Promise<string>} - Decrypted text or original
 */
async function handleBackendDecryption(text) {
  if (!text || typeof text !== 'string') {
    return text;
  }
  
  // Try to decrypt if it's backend encrypted
  if (isBackendEncrypted(text)) {
    try {
      return await backendDecrypt(text);
    } catch (error) {
      console.error('❌ Backend decryption failed:', error);
      return text; // Return encrypted text if decryption fails
    }
  }
  
  return text; // Plain text or frontend encrypted
}

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
    // console.log("sendFileMessage: Conversation ID:", resolvedConversationId);

    await verifyUserInConversation(conversation, userId);

    const otherParticipant = conversation.participants.find(
      (id) => id.toString() !== userId.toString()
    );
    const finalReceiver = resolvedReceiver || otherParticipant;

    let mediaFiles = [];
    if (req?.files?.length > 0) {
      mediaFiles = req.files.map((file) => ({
        url: `uploads/${file.filename}`,
        type: mapMimeTypeToMediaType(file.mimetype),
        filename: file.originalname,
        size: file.size,
      }));
    }

    const uniqueTypes = [...new Set(mediaFiles.map((f) => f.type))];
    let messageType = "text";
    if (uniqueTypes.length === 1) messageType = uniqueTypes[0];
    else if (uniqueTypes.length > 1) messageType = "mixed";

    // Log activity without revealing encryption methods
    logEncryptionActivity('message_send', resolvedConversationId, {
      participantsCount: conversation.participants.length,
      status: conversation.keyExchange?.status || 'none'
    });
    
    // Handle backend encryption if requested
    let processedText = resolvedText;
    let isBackendEncryptedFlag = false;
    if (resolvedText) {
      const encryptionResult = await handleBackendEncryption(resolvedText);
      processedText = encryptionResult.text;
      isBackendEncryptedFlag = encryptionResult.isBackendEncrypted;
    }

    // Prepare base message data
    const baseMessageData = {
      sender: userId,
      receiver: finalReceiver,
      conversation: resolvedConversationId,
      media: mediaFiles,
      messageType,
      status: "sent",
      scheduledDeletionTime: computeDeletionTime(conversation),
      isBackendEncrypted: isBackendEncryptedFlag
    };

    // Enhance message with zero-knowledge encryption handling
    const messageDataWithEncryption = enhanceMessageWithZeroKnowledgeEncryption(
      baseMessageData,
      processedText
    );

    const newMessage = await Message.create(messageDataWithEncryption);

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

    // Decrypt if backend encrypted
    if (populatedMessage.isBackendEncrypted && populatedMessage.text) {
      try {
        populatedMessage.text = await handleBackendDecryption(populatedMessage.text);
      } catch (error) {
        console.error('Failed to decrypt new message:', populatedMessage._id, error);
      }
    }

    // Add clientTempId to the response object (not stored in DB)
    const responseMessage = {
      ...populatedMessage.toObject(),
      clientTempId, // Include clientTempId in response
    };

    // Emit Socket.IO event
    // console.log(
    //   "sendFileMessage: Emitting receiveMessage to room:",
    //   resolvedConversationId
    // );
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

    // Log activity without revealing encryption methods
    logEncryptionActivity('text_message_send', resolvedConversationId, {
      participantsCount: conversation.participants.length,
      status: conversation.keyExchange?.status || 'none'
    });
    
    // Handle backend encryption if requested
    const encryptionResult = await handleBackendEncryption(text);
    const processedText = encryptionResult.text;
    const isBackendEncryptedFlag = encryptionResult.isBackendEncrypted;

    // Prepare base message data
    const baseMessageData = {
      sender,
      receiver: finalReceiver,
      conversation: resolvedConversationId,
      messageType: "text",
      status: "sent",
      scheduledDeletionTime: computeDeletionTime(conversation),
      isBackendEncrypted: isBackendEncryptedFlag
    };

    // Enhance message with zero-knowledge encryption handling
    const messageDataWithEncryption = enhanceMessageWithZeroKnowledgeEncryption(
      baseMessageData,
      processedText
    );

    const newMessage = await Message.create(messageDataWithEncryption);

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

    // Decrypt if backend encrypted
    if (populatedMessage.isBackendEncrypted && populatedMessage.text) {
      try {
        populatedMessage.text = await handleBackendDecryption(populatedMessage.text);
      } catch (error) {
        console.error('Failed to decrypt new message:', populatedMessage._id, error);
      }
    }

    // Add clientTempId to the response object (not stored in DB)
    const responseMessage = {
      ...populatedMessage.toObject(),
      clientTempId, // Include clientTempId in response
    };

    // Emit Socket.IO events
    // console.log(
    //   "sendTextMessage: Emitting receiveMessage to room:",
    //   responseMessage
    // );
    io.to(resolvedConversationId).emit("receiveMessage", responseMessage);
    socket.emit("sendMessageSuccess", {
      message: responseMessage,
      conversationId: resolvedConversationId,
    });
    emitConversationUpdate(io, conversationId);

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
    await Message.updateMany(
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
      }
    );

    // Fetch full updated messages
    const updatedMessages = await Message.find({
      conversation: conversationId,
      receiver: userId,
      "readBy.user": userId,
      deletedBy: { $nin: [userId] },
      $or: [
        { text: { $exists: true, $ne: "" } },
        { media: { $exists: true, $ne: [] } },
        { voice: { $exists: true } },
        { call: { $exists: true } },
        { img: { $exists: true } },
      ],
    })
      .populate("sender", "username")
      .populate("receiver", "username")
      .populate("replyTo", "_id text messageType media isBackendEncrypted");

    // Decrypt backend-encrypted messages
    await Promise.all(updatedMessages.map(async (msg) => {
      if (msg.isBackendEncrypted && msg.text) {
        try {
          msg.text = await handleBackendDecryption(msg.text);
        } catch (error) {
          console.error('Failed to decrypt message:', msg._id, error);
        }
      }
      if (msg.replyTo && msg.replyTo.isBackendEncrypted && msg.replyTo.text) {
        try {
          msg.replyTo.text = await handleBackendDecryption(msg.replyTo.text);
        } catch (error) {
          console.error('Failed to decrypt replyTo message:', msg.replyTo._id, error);
        }
      }
    }));

    // Emit messagesRead event with full message objects
    if (updatedMessages.length > 0) {
      io.to(conversationId).emit("messagesRead", {
        conversationId,
        userId,
        messages: updatedMessages.map((msg) => msg.toObject()),
      });
    } else {
      // No valid messages to mark as read
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
export const editMessageCore = async ({
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

    // Decrypt if backend encrypted
    if (populatedMessage.isBackendEncrypted && populatedMessage.text) {
      try {
        populatedMessage.text = await handleBackendDecryption(populatedMessage.text);
      } catch (error) {
        console.error('Failed to decrypt edited message:', populatedMessage._id, error);
      }
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

    const message = await Message.findOne(
      { _id: new mongoose.Types.ObjectId(messageId) },
      {
        media: 1, // array of media objects with url, type, filename, size
        sender: 1, // needed to check if user is the owner
        conversation: 1, // needed for authorization & socket room
        deletedBy: 1, // needed for soft delete check
      }
    );
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

    if (message && message.sender.toString() === userId.toString()) {
      if (Array.isArray(message.media) && message.media.length > 0) {
        for (const mediaItem of message.media) {
          if (mediaItem.url) {
            const filePath = path.join(process.cwd(), mediaItem.url);
            console.log(fs.existsSync(filePath));
            try {
              if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
              }
            } catch (err) {
              console.error(`Failed to delete file ${mediaItem.url}:`, err);
            }
          }
        }
      }
      await Message.deleteOne({ _id: message._id });
      console.log("Alhamdulillah");
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
export const sendReplyCore = async ({
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
      // Use the provided media files as-is, assuming they are already formatted correctly
      const uniqueTypes = [...new Set(mediaFiles.map((f) => f.type))];
      finalMessageType = uniqueTypes.length === 1 ? uniqueTypes[0] : "mixed";
    } else if (htmlEmoji && emojiType) {
      finalMessageType = "text";
    } else if (text) {
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
      receiver: conversation.participants.find(
        (id) => id.toString() !== sender.toString()
      ), // Set receiver explicitly
      text:
        typeof text === "string" && text.trim() !== ""
          ? text
          : htmlEmoji || null,
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
        message:
          typeof text === "string" && text.trim() !== ""
            ? text
            : htmlEmoji || "[Media]",
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
      .populate("receiver", "username")
      .populate("replyTo", "_id text messageType media isBackendEncrypted")
      .lean();

    if (populatedMessage?.replyTo) {
      populatedMessage.replyTo = {
        _id: populatedMessage.replyTo._id,
        text: populatedMessage.replyTo.text,
        messageType: populatedMessage.replyTo.messageType,
        media: populatedMessage.replyTo.media,
        isBackendEncrypted: populatedMessage.replyTo.isBackendEncrypted,
      };
    }

    // Decrypt replyTo if encrypted
    if (populatedMessage?.replyTo && populatedMessage.replyTo.isBackendEncrypted && populatedMessage.replyTo.text) {
      try {
        populatedMessage.replyTo.text = await handleBackendDecryption(populatedMessage.replyTo.text);
      } catch (error) {
        console.error('Failed to decrypt replyTo in new message:', populatedMessage.replyTo._id, error);
      }
    }

    if (!populatedMessage) {
      console.error(
        "sendReplyCore: Failed to populate message",
        newMessage._id
      );
      return {
        success: false,
        message: "Failed to populate message",
        clientTempId,
      };
    }

    // Decrypt if backend encrypted
    if (populatedMessage.isBackendEncrypted && populatedMessage.text) {
      try {
        populatedMessage.text = await handleBackendDecryption(populatedMessage.text);
      } catch (error) {
        console.error('Failed to decrypt new message:', populatedMessage._id, error);
      }
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
      url: `uploads/${file.filename}`, // Use server-side filename, matching sendFileMessage
      type: mapMimeTypeToMediaType(file.mimetype),
      filename: file.originalname,
      size: file.size,
    }));
  }

  // Determine messageType dynamically
  let finalMessageType = messageType;
  if (mediaFiles.length > 0) {
    const uniqueTypes = [...new Set(mediaFiles.map((f) => f.type))];
    finalMessageType = uniqueTypes.length === 1 ? uniqueTypes[0] : "mixed";
  } else if (htmlEmoji && emojiType) {
    finalMessageType = "text";
  } else if (text) {
    finalMessageType = "text";
  }

  console.log("replyMessage: mediaFiles:", mediaFiles);

  const result = await sendReplyCore({
    sender,
    conversationId,
    messageId,
    text,
    messageType: finalMessageType,
    htmlEmoji,
    emojiType,
    media: mediaFiles,
    clientTempId,
  });

  if (!result.success) {
    return res.status(400).json({ message: result.message, clientTempId });
  }

  // Populate the message for response
  const populatedMessage = await Message.findById(result.message._id)
    .populate("sender", "username")
    .populate("receiver", "username")
    .populate("replyTo", "_id text messageType media isBackendEncrypted");

  if (!populatedMessage) {
    console.error(
      "replyMessage: Failed to populate message",
      result.message._id
    );
    return res.status(500).json({ message: "Failed to populate message" });
  }

  // Decrypt if backend encrypted
  if (populatedMessage.isBackendEncrypted && populatedMessage.text) {
    try {
      populatedMessage.text = await handleBackendDecryption(populatedMessage.text);
    } catch (error) {
      console.error('Failed to decrypt new message:', populatedMessage._id, error);
    }
  }

  // Decrypt replyTo if encrypted
  if (populatedMessage?.replyTo && populatedMessage.replyTo.isBackendEncrypted && populatedMessage.replyTo.text) {
    try {
      populatedMessage.replyTo.text = await handleBackendDecryption(populatedMessage.replyTo.text);
    } catch (error) {
      console.error('Failed to decrypt replyTo in new message:', populatedMessage.replyTo._id, error);
    }
  }

  // Add clientTempId to the response object
  const responseMessage = {
    ...populatedMessage.toObject(),
    clientTempId,
  };

  req.io.to(conversationId).emit("receiveMessage", responseMessage);

  res.status(201).json({
    message: responseMessage,
    conversationId,
    clientTempId,
  });
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
      .populate("replyTo", "_id text messageType media isBackendEncrypted")
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum);

    // Decrypt backend-encrypted messages
    await Promise.all(messages.map(async (msg) => {
      if (msg.isBackendEncrypted && msg.text) {
        try {
          msg.text = await handleBackendDecryption(msg.text);
        } catch (error) {
          console.error('Failed to decrypt message:', msg._id, error);
        }
      }
      if (msg.replyTo && msg.replyTo.isBackendEncrypted && msg.replyTo.text) {
        try {
          msg.replyTo.text = await handleBackendDecryption(msg.replyTo.text);
        } catch (error) {
          console.error('Failed to decrypt replyTo message:', msg.replyTo._id, error);
        }
      }
    }));

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

export const addReaction = async ({
  conversationId,
  messageId,
  userId,
  emoji,
}) => {
  try {
    // Validate and get message
    const validationResult = await validateAndBuildQuery({
      conversationId,
      messageId,
      userId,
    });
    if (!validationResult.success) {
      return validationResult;
    }

    const { message } = validationResult;

    // Fetch user to get name
    const user = await User.findById(userId).select("name");
    if (!user) {
      return { success: false, message: "User not found" };
    }

    // Initialize reactions map if not exists
    if (!message.reactions) {
      message.reactions = new Map();
    }

    // Update reactions with emoji and username
    message.reactions.set(userId, { emoji, username: user.name });
    await message.save();

    return { success: true, message };
  } catch (error) {
    console.error("addReaction error:", error);
    return { success: false, message: error.message || "Server error" };
  }
};

export const removeReaction = async ({ conversationId, messageId, userId }) => {
  try {
    // Validate and get message
    const validationResult = await validateAndBuildQuery({
      conversationId,
      messageId,
      userId,
    });
    if (!validationResult.success) {
      return validationResult;
    }

    const { message } = validationResult;

    // Remove reaction
    message.reactions.delete(userId);
    await message.save();

    return { success: true, message };
  } catch (error) {
    console.error("removeReaction error:", error);
    return { success: false, message: error.message || "Server error" };
  }
};
