import Conversation from "../models/conversationModel.js";

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
    console.error("Error creating conversation:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// Get all conversations for the logged-in user
const getAllConversations = async (req, res) => {
  try {
    const { userId } = req.params; // Get logged-in user ID from request

    const conversations = await Conversation.find({ participants: userId })
      .populate("participants", "name image") // Populate both users' info
      .lean(); // Convert Mongoose documents to plain objects

    // Format conversations to include both participants' info
    const formattedConversations = conversations.map((convo) => {
      if (convo.group?.is_group) {
        return {
          _id: convo._id,
          name: convo.group.name,
          image: convo.group.image || "images/default-group.svg",
          last_message: convo.last_message,
          is_group: true,
          participants: convo.participants.map((user) => ({
            _id: user._id,
            name: user.name,
            image: user.image || "images/default-avatar.svg",
          })),
        };
      } else {
        return {
          _id: convo._id,
          senderId: convo.senderId,
          receiverId: convo.receiverId,
          status: convo.status,
          last_message: convo.last_message,
          is_group: false,
          participants: convo.participants.map((user) => ({
            _id: user._id,
            name: user.name,
            image: user.image || "images/default-avatar.svg",
          })),
        };
      }
    });

    res.json(formattedConversations);
  } catch (error) {
    console.error("Error fetching conversations:", error);
    res.status(500).json({ message: "Server error" });
  }
};

const updateMessageRequestStatus = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { status } = req.body; // "pending", "accepted", or "rejected"
    // Validate status
    const validStatuses = ["pending", "accepted", "rejected"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: "Invalid status value" });
    }

    // Find the conversation
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found" });
    }

    // Prevent unnecessary updates
    if (conversation.status === status) {
      return res.status(400).json({ message: `Message request is already ${status}` });
    }
    const statusTransitions = {
      rejected: ["pending", "accepted"], // ✅ Allow moving directly to "accepted"
      pending: ["accepted", "rejected"], 
      accepted: [], // No further transitions after "accepted"
    };
    
    if (!statusTransitions[conversation.status]?.includes(status)) {
      return res.status(400).json({ message: "Invalid status transition" });
    }
    
    // // Business logic: Ensure valid transitions
    // const statusTransitions = {
    //   rejected: ["pending"], // Can only move to "pending", not "accepted" directly
    //   pending: ["accepted", "rejected"], // Can move to "accepted" or "rejected"
    // };
    
   

    // if (!statusTransitions[conversation.status]?.includes(status)) {
    //   return res.status(400).json({ message: "Invalid status transition" });
    // }

    // Update status
    conversation.status = status;
    await conversation.save();

    // Determine event name
    const eventMapping = {
      pending: "messageRequestPending",
      accepted: "messageRequestAccepted",
      rejected: "messageRequestRejected",
    };

    // Notify participants
    conversation.participants.forEach((participant) => {
      req.io.to(participant.toString()).emit(eventMapping[status], {
        conversationId: conversation._id,
        message: `Message request ${status}`,
      });
    });

    res.status(200).json({ message: `Message request ${status}`, conversation });
  } catch (error) {
    console.error("Error updating message request status:", error);
    res.status(500).json({ message: "Server error" });
  }
};




export { createConversation, getAllConversations, updateMessageRequestStatus };
