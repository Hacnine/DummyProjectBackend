import Conversation from "../models/conversationModel.js";
import { setConversationState } from "../utils/redisClient.js";

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

export { acceptMessageRequest };