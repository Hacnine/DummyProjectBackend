import Message from "../models/chatModel.js";
import Conversation from "../models/conversationModel.js";


export const sendMessage = async (req, res) => {
  try {
    const { sender, receiver, text } = req.body;
    const conversationId = req.params.conversationId;

    // Find or create the conversation
    let conversation = await Conversation.findById(conversationId);

    if (!conversation) {
      // Create new conversation with "accepted" for sender, "pending" for receiver
      conversation = new Conversation({
        participants: [sender, receiver],
        status: "pending", // Pending for the receiver
        unread_messages: [{ user: receiver, count: 1 }],
        last_message: { message: text, sender },
      });

      await conversation.save();

      // Notify only the receiver about the message request
      req.io.to(receiver).emit("messageRequest", {
        conversationId: conversation._id,
        sender,
        text,
      });
    } else {
      // Update the conversation's last message
      conversation.last_message = { message: text, sender };

      // Update unread messages for the receiver
      const unreadIndex = conversation.unread_messages.findIndex(
        (u) => u.user.toString() === receiver
      );

      if (unreadIndex !== -1) {
        conversation.unread_messages[unreadIndex].count += 1;
      } else {
        conversation.unread_messages.push({ user: receiver, count: 1 });
      }

      await conversation.save();
    }

    // Save the message
    const newMessage = new Message({
      sender,
      receiver,
      text,
      conversation: conversation._id,
    });

    await newMessage.save();

    // req.io.to(receiver).emit('receiveMessage', newMessage);
    // res.status(201).json(newMessage);

    // Emit the message only to the receiver
    req.io.to(receiver).emit("receiveMessage", newMessage);

    res.status(201).json(newMessage);
  } catch (error) {
    console.error("Error sending message:", error);
    res.status(500).json({ message: "Server error" });
  }
};
