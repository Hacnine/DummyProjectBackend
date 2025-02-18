import Conversation from '../models/conversationModel.js';
import Message from '../models/chatModel.js';
import { setConversationState } from "../utils/redisClient.js";


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
        (um) => um.user.toString() === receiver
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
    console.error('Error sending message:', error);
    res.status(500).json({ message: 'Server error' });
  }
};


const getMessages = async (req, res) => {
  const { conversationId } = req.params;
  const conversation = await Conversation.findById(conversationId);
  if (!conversation) {
    return res.status(404).json({ message: 'Conversation not found' });
  }
  const messages = await Message.find({ conversation: conversationId });
  res.status(200).json(messages);
};


const acceptMessageRequest = async (req, res) => {
  try {
    const { conversationId } = req.params; 

    // Find the conversation
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found" });
    }

    // Check if it's a pending request
    if (conversation.status !== "pending") {

      return res.status(400).json({ message: "Message request already processed" });
    }

    // Update conversation status to accepted
    conversation.status = "accepted";
    await conversation.save();

    // Set conversation state in Redis
    await setConversationState(conversationId, 'accepted');

    // Notify participants
    conversation.participants.forEach((participant) => {
      req.io.to(participant.toString()).emit("messageRequestAccepted", {
        conversationId: conversation._id,
        message: "Message request accepted",
      });
    });

    res.status(200).json({ message: "Message request accepted", conversation });
  } catch (error) {
    console.error("Error accepting message request:", error);
    res.status(500).json({ message: "Server error" });
  }
};


export { sendMessage, getMessages, acceptMessageRequest };
// req.io.to(receiver).emit("receiveMessage", newMessage);
