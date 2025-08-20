import Conversation from "../models/conversationModel.js";
import JoinRequest from "../models/joinRequestModel.js";
import User from "../models/userModel.js";
import mongoose from "mongoose";

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
      .populate("participants", "name image")
      .sort({ updatedAt: -1 }) // <-- Sort by activity
      .limit(30) // <-- Only fetch most recent 30
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
          conversationType: convo.group.type || "group", //  Add this
          participants: convo.participants.map((user) => ({
            _id: user._id,
            name: user.name,
            image: user.image ,
          })),
        };
      } else {
        return {
          _id: convo._id,
          status: convo.status,
          last_message: convo.last_message,
          is_group: false,
          conversationType: "one to one",
          participants: convo.participants.map((user) => ({
            _id: user._id,
            name: user.name,
            image: user.image ,
          })),
          unreadMessages: 0,
        };
      }
    });

    res.json(formattedConversations);
  } catch (error) {
    console.error("Error fetching conversations:", error);
    res.status(500).json({ message: "Server error" });
  }
};

const escapeRegex = (string) => {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

export const searchGroups = async (req, res) => {
  try {
    const { query, page = 1, limit = 10 } = req.query;
    const currentUserId = req.user._id;

    // Validate query parameter
    if (!query) {
      return res.status(400).json({ error: "Query parameter is required" });
    }

    if (!query.match(/^[a-zA-Z0-9._%+-@ ]*$/)) {
      return res.status(400).json({ error: "Invalid query characters" });
    }

    // Validate pagination parameters
    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);

    if (pageNum < 1 || limitNum < 1) {
      return res
        .status(400)
        .json({ error: "Page and limit must be positive integers" });
    }

    const escapedQuery = escapeRegex(query);
    let searchCriteria = [];

    // Search for public group conversations by name
    searchCriteria.push({
      "group.name": { $regex: escapedQuery, $options: "i" },
      "group.is_group": true,
      "group.type": "group",
      visibility: "public",
    });

    // Search for users by name or email
    const users = await User.find({
      $or: [
        { name: { $regex: escapedQuery, $options: "i" } },
        { email: { $regex: escapedQuery, $options: "i" } },
      ],
    }).select("_id");

    // Validate user IDs
    if (users.length > 0) {
      const userIds = users
        .map((user) => user._id)
        .filter((id) => mongoose.isValidObjectId(id));

      if (userIds.length > 0) {
        searchCriteria.push({
          participants: { $in: userIds },
          "group.is_group": true,
          "group.type": "group",
          visibility: "public",
        });
      } else {
        console.warn("No valid user IDs found for query:", query);
      }
    }

    // If no search criteria, return empty result
    const finalCriteria =
      searchCriteria.length > 0 ? { $or: searchCriteria } : {};

    const total = await Conversation.countDocuments(finalCriteria);

    const conversations = await Conversation.find(finalCriteria)
      .select("group.name group.image group.intro group.type participants")
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .lean();

    if (!conversations.length) {
      return res.status(404).json({ message: "Not found" });
    }

    // Fetch pending join requests for the current user
    const conversationIds = conversations.map((conv) => conv._id);
    const pendingRequests = await JoinRequest.find({
      userId: currentUserId,
      classId: { $in: conversationIds },
      status: "pending",
    })
      .select("classId")
      .lean();

    // Create a Set of conversation IDs with pending requests for O(1) lookup
    const pendingRequestIds = new Set(
      pendingRequests.map((req) => req.classId.toString())
    );

    const formattedGroups = conversations.map((conv) => {
      const alreadyMember = conv.participants?.some(
        (participantId) => participantId.toString() === currentUserId.toString()
      );

      return {
        _id: conv._id.toString(),
        name: conv.group?.name || "Unnamed Group",
        image: conv.group?.image || null,
        intro: conv.group?.intro || "N/A",
        type: conv.group?.type || "group",
        members: conv.participants?.length || 0,
        status: alreadyMember ? "active" : "inactive",
        alreadyMember: !!alreadyMember,
        hasPendingRequest: pendingRequestIds.has(conv._id.toString()),
      };
    });

    res.status(200).json({
      groups: formattedGroups,
      total,
      page: pageNum,
      totalPages: Math.ceil(total / limitNum),
    });
  } catch (error) {
    console.error("Error searching groups:", error);
    res.status(500).json({ error: "Server error" });
  }
};

export const createGroup = async (req, res) => {
  try {
    const { name, intro, image, visibility = "public" } = req.body;
    const creatorId = req.user._id;

    // Validate inputs
    if (!name || !name.trim()) {
      return res.status(400).json({ message: "Group name is required" });
    }
    if (!["public", "private"].includes(visibility)) {
      return res
        .status(400)
        .json({ message: "Visibility must be 'public' or 'private'" });
    }

    // Create new group conversation
    const newGroup = new Conversation({
      participants: [creatorId], // Initialize with creator
      group: {
        is_group: true,
        type: "group",
        name: name.trim(),
        intro: intro ? intro.trim() : undefined,
        image: image ? image.trim() : undefined,
        admins: [creatorId],
      },
      visibility,
    });

    // Save and populate
    await newGroup.save();
    await newGroup.populate("group.admins", "name email image");
    await newGroup.populate("participants", "name email image"); // Populate participants

    res.status(201).json({
      message: "Group created successfully",
      group: newGroup,
    });
  } catch (error) {
    console.error("Error creating group:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const getConversationById = async (req, res) => {
  const { chatId } = req.params;
  const { userId } = req.query;

  //  Validate input parameters
  if (!chatId || !userId) {
    return res.status(400).json({ message: "Invalid chat ID" });
  }

  try {
    //  Fetch conversation and populate participants
    const conversation = await Conversation.findById(chatId)
      .select(
        "-updatedAt -createdAt -unread_messages -last_message"
      )
      .populate("participants", "name image")
      .lean();

    //  If conversation does not exist, return 404
    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found" });
    }

    //  Check if `userId` is part of the conversation
    const isParticipant = conversation.participants.some(
      (participant) => participant._id.toString() === userId
    );

    if (!isParticipant) {
      return res.status(403).json({
        message:
          "Access denied: You are not a participant in this conversation",
      });
    }

    //  Format response
    const formattedConversation = {
      ...conversation,
      participants: conversation.participants.map((user) => ({
        _id: user._id,
        name: user.name,
        image: user.image ,
        
      })),
      themeIndex: conversation.themeIndex
    };

    return res.json(formattedConversation);
  } catch (error) {
    console.error("Error fetching conversation info:", error);
    return res.status(500).json({ message: "Failed to get conversation info" });
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
      return res
        .status(400)
        .json({ message: `Message request is already ${status}` });
    }
    const statusTransitions = {
      rejected: ["pending", "accepted"], //  Allow moving directly to "accepted"
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

    res
      .status(200)
      .json({ message: `Message request ${status}`, conversation });
  } catch (error) {
    console.error("Error updating message request status:", error);
    res.status(500).json({ message: "Server error" });
  }
};

export const updateConversationThemeIndex = async (req, res) => {
  try {
    const { themeIndex } = req.body;
    const { id } = req.params;

    const conversation = await Conversation.findByIdAndUpdate(
      id,
      { themeIndex },
      { new: true }
    );
    if (!conversation)
      return res.status(404).json({ message: "Conversation not found" });
    res.json({
      message: "Theme index updated",
      themeIndex: conversation.themeIndex,
    });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};


export const deleteConversation = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if the ID is a valid ObjectId
    if (!id || id.length !== 24) {
      return res.status(400).json({ message: "Invalid conversation ID." });
    }

    // Try to find and delete the conversation
    const deletedConversation = await Conversation.findByIdAndDelete(id);

    if (!deletedConversation) {
      return res.status(404).json({ message: "Conversation not found." });
    }

    res.status(200).json({ message: "Conversation deleted successfully." });
  } catch (error) {
    console.error("Error deleting conversation:", error);
    res.status(500).json({ message: "Server error. Could not delete conversation." });
  }
};


export {
  createConversation,
  getAllConversations,
  getConversationById,
  updateMessageRequestStatus,
};
