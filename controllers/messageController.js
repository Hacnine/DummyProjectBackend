import Conversation from '../models/conversationModel.js';
import Message from '../models/chatModel.js';

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

export { sendMessage };
// req.io.to(receiver).emit("receiveMessage", newMessage);
