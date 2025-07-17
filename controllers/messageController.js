import Conversation from "../models/conversationModel.js";
import Message from "../models/chatModel.js";
import mongoose from "mongoose";

const sendMessage = async (req, res) => {
  const { sender, receiver, text } = req.body;
  const { conversationId } = req.params;

  try {
    const newMessage = new Message({
      sender,
      receiver,
      text,
      conversation: conversationId,
    });

    await newMessage.save();

    // Update the conversation with the last message and unread messages
    const conversation = await Conversation.findById(conversationId);
    if (conversation) {
      conversation.last_message = {
        message: text,
        sender: sender,
        timestamp: new Date(),
      };

      // Update unread messages count for the receiver
      const unreadMessage = conversation.unread_messages.find(
  (um) => um.user && um.user.toString() === receiver
);
      if (unreadMessage) {
        unreadMessage.count += 1;
      } else {
        conversation.unread_messages.push({ user: receiver, count: 1 });
      }

      await conversation.save();
    }

    // Emit the message to the receiver
    req.io.to(receiver).emit("receiveMessage", newMessage);

    res.status(201).json(newMessage);
  } catch (error) {
    console.error("Error sending message:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// Handle Read Messages Event
const markMessagesAsRead = async (conversationId, userId, io) => {
  try {
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) return;

    // Reset unread messages for this user
    const unreadMessage = conversation.unread_messages.find(
      (um) => um.user.toString() === userId
    );
    if (unreadMessage) {
      unreadMessage.count = 0; // Reset unread count
    }

    await conversation.save();

    // Notify all users in the conversation that messages are read
    io.to(conversationId).emit("messagesRead", {
      conversationId,
      userId,
    });
  } catch (error) {
    console.error("Error marking messages as read:", error);
  }
};

// Socket.io Setup
const setupSocket = (io) => {
  io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    socket.on("joinConversation", (conversationId) => {
      socket.join(conversationId);
    });

    socket.on("messageRead", async ({ conversationId, userId }) => {
      await markMessagesAsRead(conversationId, userId, io);
    });

    socket.on("disconnect", () => {
      console.log("User disconnected:", socket.id);
    });
  });
};

const getMessages = async (req, res) => {
  const { conversationId } = req.params;
  const { userId, participant1, participant2 } = req.query;

  try {
    if (conversationId && mongoose.Types.ObjectId.isValid(conversationId)) {
      // Fetch messages by conversationId
      const conversation = await Conversation.findById(conversationId);
      //  Check if `userId` is part of the conversation
      const isParticipant = conversation.participants.some(
        (participant) => participant._id.toString() === userId
      );

      if (!conversation || !isParticipant) {
        return res.status(404).json({ message: "Conversation not found" });
      }
      const messages = await Message.find({ conversation: conversationId });

      return res.status(200).json(messages);
    } else if (participant1 && participant2) {
      // Fetch messages by participants
      const messages = await Message.find({
        $or: [
          { sender: participant1, receiver: participant2 },
          { sender: participant2, receiver: participant1 },
        ],
      });
      return res.status(200).json(messages);
    } else {
      return res.status(400).json({ message: "Invalid request parameters" });
    }
  } catch (error) {
    console.error("Error fetching messages:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

export { sendMessage, getMessages };
// req.io.to(receiver).emit("receiveMessage", newMessage);
