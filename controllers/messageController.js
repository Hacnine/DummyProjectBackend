import Conversation from "../models/conversationModel.js";
import Message from "../models/messageModel.js";
import File from "../models/fileModel.js"; // Added for file handling
import mongoose from "mongoose";

// Helper to validate ObjectId
const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

// Helper to check if user is a conversation participant
const isUserInConversation = async (conversationId, userId) => {
  const conversation = await Conversation.findById(conversationId);
  return conversation?.participants.some((p) => p.equals(userId));
};


// Send a message (text or file)
const sendMessage = async (req, res) => {
  const { conversationId } = req.params;
  const { text, replyTo, messageType = "text" } = req.body;
  const sender = req.user._id; // Assuming user is attached via auth middleware
  let receiver = req.body.receiver; // Optional for group chats
  let media = [];

  try {
    // Validate conversation and user participation
    if (!isValidObjectId(conversationId) || !(await isUserInConversation(conversationId, sender))) {
      console.log("Sender:", sender);
      console.log("Conversation ID:", conversationId);
      return res.status(403).json({ message: "Invalid conversation or unauthorized" });
    }

    // Handle file uploads for image, video, audio, or file
    if (req.file && messageType !== "text") {
      const allowedTypes = ["image", "video", "audio", "file"];
      if (!allowedTypes.includes(messageType)) {
        return res.status(400).json({ message: "Invalid message type" });
      }

      // Save file to File model
      const file = new File({
        filename: req.file.filename,
        originalName: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
        path: req.file.path,
        uploadedBy: sender,
        classId: conversationId,
      });

      await file.save();

      // Add file metadata to message's media array
      media.push({
        url: `/uploads/${file.filename}`,
        type: messageType,
        filename: file.originalName,
        size: file.size,
      });
    }

    // Validate replyTo if provided
    if (replyTo && !isValidObjectId(replyTo)) {
      return res.status(400).json({ message: "Invalid replyTo message ID" });
    }

    // Create new message
    const newMessage = new Message({
      conversation: conversationId,
      sender,
      receiver: receiver ? (isValidObjectId(receiver) ? receiver : null) : null,
      text: messageType === "text" ? text : "",
      messageType,
      media,
      replyTo: replyTo || null,
    });

    await newMessage.save();

    // Update conversation's last message and unread counts
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found" });
    }

    // Update last message
    conversation.last_message = {
      message: text || `${messageType} message`,
      sender,
      timestamp: new Date(),
    };

    // Log participants for debugging
    console.log("Participants:", conversation.participants);

    // Update unread messages for participants (except sender)
    conversation.participants.forEach((participant) => {
      // Ensure participant is a valid ObjectId
      if (!isValidObjectId(participant)) {
        console.warn(`Invalid participant ID: ${participant}`);
        return;
      }

      if (participant.toString() !== sender.toString()) {
        const unreadMessage = conversation.unread_messages.find(
          (um) => um.user && um.user.toString() === participant.toString()
        );
        if (unreadMessage) {
          unreadMessage.count += 1;
        } else {
          // Only push valid participant IDs
          conversation.unread_messages.push({
            user: mongoose.Types.ObjectId(participant),
            count: 1,
          });
        }
      }
    });

    await conversation.save();

    // Populate sender, receiver, and replyTo for emission
    const populatedMessage = await Message.findById(newMessage._id)
      .populate("sender", "username")
      .populate("receiver", "username")
      .populate("replyTo");

    // Emit message to conversation room
    req.io.to(conversationId).emit("receiveMessage", populatedMessage);

    res.status(201).json(populatedMessage);
  } catch (error) {
    console.error("Error sending message:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// Edit a message
const editMessage = async (req, res) => {
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
      return res.status(403).json({ message: "Unauthorized to edit this message" });
    }

    // Only text messages can be edited
    if (message.messageType !== "text") {
      return res.status(400).json({ message: "Only text messages can be edited" });
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
const deleteMessage = async (req, res) => {
  const { messageId } = req.params;
  const userId = req.user._id;

  try {
    if (!isValidObjectId(messageId)) {
      return res.status(400).json({ message: "Invalid message ID" });
    }

    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({ message: "Message not found" });
    }

    // Check if user is the sender or a conversation participant
    if (!(await isUserInConversation(message.conversation.toString(), userId))) {
      return res.status(403).json({ message: "Unauthorized to delete this message" });
    }

    // Add user to deletedBy array
    if (!message.deletedBy.includes(userId)) {
      message.deletedBy.push(userId);
      await message.save();
    }

    // Emit delete event to conversation room
    req.io.to(message.conversation.toString()).emit("messageDeleted", { messageId, userId });

    res.status(200).json({ message: "Message deleted successfully" });
  } catch (error) {
    console.error("Error deleting message:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// Reply to a message
const replyMessage = async (req, res) => {
  const { conversationId, messageId } = req.params;
  const { text, messageType = "reply" } = req.body;
  const sender = req.user._id;
  let receiver = req.body.receiver;

  try {
    // Validate conversation and message
    if (!isValidObjectId(conversationId) || !isValidObjectId(messageId)) {
      return res.status(400).json({ message: "Invalid conversation or message ID" });
    }

    if (!(await isUserInConversation(conversationId, sender))) {
      return res.status(403).json({ message: "Unauthorized to reply in this conversation" });
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
const getMessages = async (req, res) => {
  const { conversationId } = req.params;
  const { userId, participant1, participant2, page = 1, limit = 20 } = req.query;

  try {
    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);

    if (conversationId && isValidObjectId(conversationId)) {
      // Fetch messages by conversationId with pagination
      if (!(await isUserInConversation(conversationId, userId))) {
        return res.status(403).json({ message: "Unauthorized to view this conversation" });
      }

      const messages = await Message.find({ conversation: conversationId })
        .populate("sender", "username")
        .populate("receiver", "username")
        .populate("replyTo")
        .sort({ createdAt: -1 }) // Newest first
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum);

      const totalMessages = await Message.countDocuments({ conversation: conversationId });

      return res.status(200).json({
        messages,
        totalPages: Math.ceil(totalMessages / limitNum),
        currentPage: pageNum,
      });
    } else if (participant1 && participant2 && isValidObjectId(participant1) && isValidObjectId(participant2)) {
      // Fetch messages by participants with pagination
      const messages = await Message.find({
        $or: [
          { sender: participant1, receiver: participant2 },
          { sender: participant2, receiver: participant1 },
        ],
      })
        .populate("sender", "username")
        .populate("receiver", "username")
        .populate("replyTo")
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum);

      const totalMessages = await Message.countDocuments({
        $or: [
          { sender: participant1, receiver: participant2 },
          { sender: participant2, receiver: participant1 },
        ],
      });

      return res.status(200).json({
        messages,
        totalPages: Math.ceil(totalMessages / limitNum),
        currentPage: pageNum,
      });
    } else {
      return res.status(400).json({ message: "Invalid request parameters" });
    }
  } catch (error) {
    console.error("Error fetching messages:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

// Mark messages as read
const markMessagesAsRead = async (req, res) => {
  const { conversationId } = req.params;
  const userId = req.user._id;

  try {
    if (!isValidObjectId(conversationId)) {
      return res.status(400).json({ message: "Invalid conversation ID" });
    }

    if (!(await isUserInConversation(conversationId, userId))) {
      return res.status(403).json({ message: "Unauthorized to mark messages as read" });
    }

    // Mark messages as read
    await Message.updateMany(
      { conversation: conversationId, readBy: { $ne: { user: userId } } },
      { $push: { readBy: { user: userId, readAt: new Date() } } }
    );

    // Reset unread count in conversation
    const conversation = await Conversation.findById(conversationId);
    if (conversation) {
      const unreadMessage = conversation.unread_messages.find(
        (um) => um.user.toString() === userId.toString()
      );
      if (unreadMessage) {
        unreadMessage.count = 0;
        await conversation.save();
      }
    }

    // Emit read event
    req.io.to(conversationId).emit("messagesRead", { conversationId, userId });

    res.status(200).json({ message: "Messages marked as read" });
  } catch (error) {
    console.error("Error marking messages as read:", error);
    res.status(500).json({ message: "Server error" });
  }
};

export { sendMessage, editMessage, deleteMessage, replyMessage, getMessages, markMessagesAsRead };