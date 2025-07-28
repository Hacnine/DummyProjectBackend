import Conversation from "../models/conversationModel.js";
import Message from "../models/messageModel.js";
import File from "../models/fileModel.js"; // Added for file handling
import mongoose from "mongoose";
import JoinRequest from "../models/joinRequestModel.js";

// Helper to validate ObjectId
const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

// Helper to check if user is a conversation participant
const isUserInConversation = async (conversationId, userId) => {
  const conversation = await Conversation.findById(conversationId);
  return conversation?.participants.some((p) => p.equals(userId));
};

// Helper to map MIME types to schema's media.type enum
const mapMimeTypeToMediaType = (mimeType) => {
  if (!mimeType) return 'file'; // Default to 'file' if MIME type is missing
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  return 'file'; // Fallback for other types (e.g., application/pdf, text/plain)
};

export const sendMessage = async ({ req, res, io, socket, conversationId, sender, receiver, text, media } = {}) => {
  // Determine if this is an API or socket call
  const isSocket = !!(io && socket);
  const userId = isSocket ? sender : req?.user?._id;

  try {
    if (!userId || !isValidObjectId(userId)) {
      if (isSocket) {
        socket.emit("sendMessageError", { message: "Invalid sender ID" });
        return { success: false, message: "Invalid sender ID" };
      }
      return res.status(400).json({ message: "Invalid sender ID" });
    }

    let resolvedConversationId = conversationId;
    let conversation;

    if (!resolvedConversationId) {
      if (!receiver || !isValidObjectId(receiver)) {
        if (isSocket) {
          socket.emit("sendMessageError", { message: "Receiver is required for new conversation" });
          return { success: false, message: "Receiver is required for new conversation" };
        }
        return res.status(400).json({ message: "Receiver is required for new conversation" });
      }

      // Try to find existing one-to-one conversation
      conversation = await Conversation.findOne({
        participants: { $all: [userId, receiver], $size: 2 },
        "group.is_group": false,
      });

      if (!conversation) {
        // Create new one-to-one conversation
        conversation = new Conversation({
          participants: [
            new mongoose.Types.ObjectId(userId),
            new mongoose.Types.ObjectId(receiver),
          ],
          senderId: userId,
          receiverId: receiver,
          visibility: "private",
          group: { is_group: false },
        });

        await conversation.save();
      }

      resolvedConversationId = conversation._id;
    } else {
      if (!isValidObjectId(resolvedConversationId)) {
        if (isSocket) {
          socket.emit("sendMessageError", { message: "Invalid conversation ID" });
          return { success: false, message: "Invalid conversation ID" };
        }
        return res.status(400).json({ message: "Invalid conversation ID" });
      }

      conversation = await Conversation.findById(resolvedConversationId);
      if (!conversation) {
        if (isSocket) {
          socket.emit("sendMessageError", { message: "Conversation not found" });
          return { success: false, message: "Conversation not found" };
        }
        return res.status(404).json({ message: "Conversation not found" });
      }
    }

    // Verify user is in conversation
    if (!(await isUserInConversation(resolvedConversationId, userId))) {
      if (isSocket) {
        socket.emit("sendMessageError", { message: "Unauthorized to send message in this conversation" });
        return { success: false, message: "Unauthorized to send message in this conversation" };
      }
      return res.status(403).json({ message: "Unauthorized to send message in this conversation" });
    }

    // Determine receiver
    const otherParticipant = conversation.participants.find(
      (id) => id.toString() !== userId.toString()
    );
    const resolvedReceiver = receiver || otherParticipant;

    // Create and save the message
    const newMessage = new Message({
      sender: userId,
      receiver: resolvedReceiver,
      text,
      conversation: resolvedConversationId,
      media: isSocket && media && media.length > 0
        ? media.map(file => ({
            url: file.name, // Note: Actual file upload requires API
            type: mapMimeTypeToMediaType(file.type), // Map MIME type to schema enum
            filename: file.name,
            size: file.size
          }))
        : req?.file
          ? [{
              url: req.file.filename, // Use filename instead of path to store relative path
              type: mapMimeTypeToMediaType(req.file.mimetype),
              filename: req.file.originalname,
              size: req.file.size
            }]
          : [],
    });

    await newMessage.save();

    // Update last message in conversation
    conversation.last_message = {
      message: text || "[Media]",
      sender: userId,
      timestamp: new Date(),
    };

    // Update unread messages for receiver
    const unread = conversation.unread_messages.find(
      (um) => um.user.toString() === resolvedReceiver.toString()
    );

    if (unread) {
      unread.count += 1;
    } else {
      conversation.unread_messages.push({ user: resolvedReceiver, count: 1 });
    }

    await conversation.save();

    // Populate message for response
    const populatedMessage = await Message.findById(newMessage._id)
      .populate("sender", "username")
      .populate("receiver", "username")
      .populate("replyTo");

    // Emit socket events
    if (isSocket) {
      io.to(resolvedConversationId).emit("receiveMessage", populatedMessage);
      socket.emit("sendMessageSuccess", { message: populatedMessage, conversationId: resolvedConversationId });
      return { success: true, message: populatedMessage, conversationId: resolvedConversationId };
    } else {
      req.io.to(resolvedReceiver.toString()).emit("receiveMessage", populatedMessage);
      res.status(201).json({ message: populatedMessage, conversationId: resolvedConversationId });
    }
  } catch (error) {
    console.error("Error sending message:", error);
    if (isSocket) {
      socket.emit("sendMessageError", { message: error.message || "Server error" });
      return { success: false, message: error.message || "Server error" };
    }
    res.status(500).json({ message: "Server error" });
  }
};

export const sendEmoji = async (req, res) => {
  const sender = req.user._id; // Sender from authenticated user
  const { receiver, text, htmlEmoji, emojiType, mediaUrl } = req.body;
  let { conversationId } = req.params;

  // Validate required fields for custom emojis
  if (emojiType === "custom" && (!text || !htmlEmoji || !mediaUrl)) {
    return res.status(400).json({ message: "Text, htmlEmoji, and mediaUrl are required for custom emojis" });
  }

  // Validate emojiType
  if (emojiType && !["custom", "standard"].includes(emojiType)) {
    return res.status(400).json({ message: "Invalid emojiType" });
  }

  try {
    let conversation;

    if (!conversationId) {
      if (!receiver) {
        return res.status(400).json({ message: "Receiver is required for new conversation" });
      }

      // Try to find existing one-to-one conversation
      conversation = await Conversation.findOne({
        participants: { $all: [sender, receiver], $size: 2 },
        "group.is_group": false,
      });

      if (!conversation) {
        // Create new one-to-one conversation
        conversation = new Conversation({
          participants: [
            new mongoose.Types.ObjectId(sender),
            new mongoose.Types.ObjectId(receiver),
          ],
          visibility: "private",
          group: { is_group: false },
        });

        await conversation.save();
      }

      conversationId = conversation._id;
    } else {
      // Existing conversation
      conversation = await Conversation.findById(conversationId);
      if (!conversation) {
        return res.status(404).json({ message: "Conversation not found" });
      }
    }

    // Determine receiver if not explicitly sent
    const otherParticipant = conversation.participants.find(
      (id) => id.toString() !== sender.toString()
    );
    const resolvedReceiver = receiver || otherParticipant;

    // Create and save the message
    const newMessage = new Message({
      sender,
      receiver: resolvedReceiver,
      text: text || htmlEmoji || "", // Fallback to htmlEmoji for standard emojis
      conversation: conversationId,
      messageType: "text", // Emojis are treated as text messages
      htmlEmoji: htmlEmoji || null,
      emojiType: emojiType || null,
      media: emojiType === "custom" ? [{ url: mediaUrl, type: "image" }] : [],
    });

    await newMessage.save();

    // Update last message in conversation
    conversation.last_message = {
      message: text || htmlEmoji || "[Emoji]",
      sender,
      timestamp: new Date(),
    };

    // Update unread messages for receiver
    const unread = conversation.unread_messages.find(
      (um) => um.user.toString() === resolvedReceiver.toString()
    );

    if (unread) {
      unread.count += 1;
    } else {
      conversation.unread_messages.push({ user: resolvedReceiver, count: 1 });
    }

    await conversation.save();

    // Emit real-time socket event
    req.io.to(resolvedReceiver.toString()).emit("receiveMessage", newMessage);

    res.status(201).json({ message: newMessage, conversationId });
  } catch (error) {
    console.error("Error sending emoji:", error);
    res.status(500).json({ message: "Server error" });
  }
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
export const deleteMessage = async ({ io, socket, messageId, userId, req, res }) => {
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

    if (!(await isUserInConversation(message.conversation.toString(), userId))) {
      if (res) return res.status(403).json({ message: "Unauthorized to delete this message" });
      socket.emit("deleteMessageError", { message: "Unauthorized to delete this message" });
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
      res.status(200).json({ message: "Message deleted successfully", hardDelete });
      return { success: true, hardDelete };
    }

    return { success: true, message: "Message deleted successfully", hardDelete };
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
      return res.status(403).json({ message: "Unauthorized to view this conversation" });
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

;
