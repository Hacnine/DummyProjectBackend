import Conversation from '../models/conversationModel.js';
import Message from '../models/chatModel.js';

const createConversation = async (req, res) => {
  const { senderId, receiverId } = req.body;
  const existingConversation = await Conversation.findOne({
    participants: { $all: [senderId, receiverId] },
  });
  if (existingConversation) {
    return res.status(200).json(existingConversation);
  }
  const newConversation = new Conversation({
    participants: [senderId, receiverId],
  });
  await newConversation.save();
  res.status(201).json(newConversation);
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

export { createConversation, getMessages };