import Conversation from '../models/conversationModel.js';
import Message from '../models/chatModel.js';

const createConversation = async (req, res) => {
  const { senderId, receiverId } = req.body;
  try {
    // Check if a conversation already exists between the two users
    const existingConversation = await Conversation.findOne({
      participants: { $all: [senderId, receiverId] },
    });

    if (existingConversation) {
      return res.status(200).json(existingConversation);
    }

    // If no conversation exists, create a new one
    const newConversation = new Conversation({
      participants: [senderId, receiverId],
      senderId: senderId,
      receiverId: receiverId,
    });

    // save status in redis
    // const status = await getConversationState(conversationId) || response.data.status;
    // res.status(201).json({ ...response.data, status });

    await newConversation.save();
    res.status(201).json(newConversation);
  } catch (error) {
    console.error('Error creating conversation:', error);
    res.status(500).json({ message: 'Server error' });
  }
};


// Get all conversations for the logged-in user
 const getConversations = async (req, res) => {
  try {
    const { userId } = req.params; // Get logged-in user ID from request

    const conversations = await Conversation.find({ participants: userId })
      .populate("participants", "name image") // Get user details
      .lean(); // Convert Mongoose documents to plain objects

    // Format the conversations to return the correct name & image
    const formattedConversations = conversations.map((convo) => {
      if (convo.group.is_group) {
        return {
          _id: convo._id,
          name: convo.group.name,
          image: convo.group.image || "/default-group.png",
          last_message: convo.last_message,
          is_group: true,
        };
      } else {
        // Find the other user in the conversation
        const otherUser = convo.participants.find((user) => user._id.toString() !== userId);
        return {
          _id: convo._id,
          name: otherUser?.name || "Unknown",
          image: otherUser?.image || "/default-avatar.png",
          last_message: convo.last_message,
          is_group: false,
        };
      }
    });

    res.json(formattedConversations);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};


export { createConversation, getConversations };