import Conversation from "../models/conversationModel.js";
import JoinRequest from "../models/joinRequestModel.js";
import User from "../models/userModel.js";
import mongoose from "mongoose";
import { formatConversation } from "../utils/controller-utils/conversationUtils.js";
import { FriendList } from "../models/friendListModel.js";

export const createConversation = async (req, res) => {
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
export const getAllConversations = async (req, res) => {
  try {
    const { userId } = req.params; // Logged-in user ID

    const conversations = await Conversation.find({ participants: userId })
      .populate("participants", "name image")
      .sort({ updatedAt: -1 }) // sort by activity
      .limit(30) // fetch recent 30
      .lean();

    const formattedConversations = conversations.map((convo) =>
      formatConversation(convo, userId)
    );

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

    // Search for public group conversations by name
    const searchCriteria = {
      "group.name": { $regex: escapedQuery, $options: "i" },
      "group.is_group": true,
      "group.type": "group",
      visibility: "public",
      participants: { $nin: [currentUserId] },
    };

    const total = await Conversation.countDocuments(searchCriteria);

    const conversations = await Conversation.find(searchCriteria)
      .select("group.name group.image group.intro group.type participants")
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .lean();

    if (!conversations.length) {
      return res.status(200).json({
        groups: [],
        total: 0,
        page: pageNum,
        totalPages: 0,
      });
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

    // Use Set for O(1) lookup of pending request classIds
    const pendingRequestIds = new Set(
      pendingRequests.map((req) => req.classId.toString())
    );

    const formattedGroups = conversations.map((conv) => ({
      _id: conv._id.toString(),
      name: conv.group?.name || "Unnamed Group",
      image: conv.group?.image || null,
      intro: conv.group?.intro || "N/A",
      type: conv.group?.type || "group",
      members: conv.participants?.length || 0,
      hasPendingRequest: pendingRequestIds.has(conv._id.toString()),
    }));

    res.status(200).json({
      groups: formattedGroups,
      total,
      page: pageNum,
      totalPages: Math.ceil(total / limitNum),
    });
  } catch (error) {
    console.error("Error searching groups:", error.message);
    res.status(500).json({ error: "Internal server error" });
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

export const getConversationById = async (req, res) => {
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


export const acceptMessageRequest = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { conversationId } = req.params;

    // Find the conversation
    const conversation = await Conversation.findById(conversationId).session(session);
    if (!conversation) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: "Conversation not found" });
    }

    // Check if already accepted
    if (conversation.status === "accepted") {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(400)
        .json({ message: "Message request already accepted" });
    }

    // Update status
    conversation.status = "accepted";
    await conversation.save({ session });

    // Update friend lists for both users
    const [userA, userB] = conversation.participants;

    // Add userB to userA's friend list
    await FriendList.updateOne(
      { user: userA },
      { $addToSet: { friends: userB } },
      { upsert: true, session }
    );

    // Add userA to userB's friend list
    await FriendList.updateOne(
      { user: userB },
      { $addToSet: { friends: userA } },
      { upsert: true, session }
    );

    // Commit the transaction
    await session.commitTransaction();
    session.endSession();

    // Notify participants after commit
    conversation.participants.forEach((participant) => {
      req.io.to(participant.toString()).emit("messageRequestAccepted", {
        conversationId: conversation._id,
        message: `Message request accepted`,
      });
    });

    res
      .status(200)
      .json({ message: "Message request accepted", conversation });
  } catch (error) {
    console.error("Error accepting message request:", error);
    await session.abortTransaction();
    session.endSession();
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




     
export const getPendingConversations = async (req, res) => {
  try {
    const userId = req.user._id;

    // Validate userId
    if (!mongoose.isValidObjectId(userId)) {
      return res.status(400).json({ message: "Valid User ID is required" });
    }

    // Pagination parameters
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Find all pending one-to-one conversations for the user
    const conversations = await Conversation.find({
      participants: userId,
      status: "pending",
      "group.is_group": false,
    })
      .populate("participants", "name image")
      .populate("last_message.sender", "name image")
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit);

    res.json({ conversations });
  } catch (error) {
    console.error("Error fetching pending conversations:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// make sure you have the right import path

export const getGroupJoinRequests = async (req, res) => {
  try {
    const userId = req.user._id;

    if (!mongoose.isValidObjectId(userId)) {
      return res.status(400).json({ message: "Valid User ID is required" });
    }

    const user = await User.findById(userId).select("_id");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    let query = {};
    let groups = [];

    // Admins / moderators: groups where they have privileges
    groups = await Conversation.find({
      "group.type": "group",
      $or: [{ "group.admins": userId }, { "group.moderators": userId }],
    })
      .select("_id group.name")
      .lean();

    if (groups.length > 0) {
      query = {
        classId: { $in: groups.map((g) => g._id) },
        status: "pending",
      };
    } else {
      // Non-admins/moderators: only their own pending requests
      const myPendingClassIds = await JoinRequest.find({
        userId,
        status: "pending",
      }).distinct("classId");

      groups = await Conversation.find({
        "group.type": "group",
        _id: { $in: myPendingClassIds },
      })
        .select("_id group.name group.image")
        .lean();

      query = { userId, status: "pending" };
    }

    // Fetch requests (do NOT populate userId; we’ll fetch users ourselves)
    const requests = await JoinRequest.find(query)
      .populate("classId", "group.name") // keep group name
      .sort({ requestedAt: -1 })
      .lean();

    // Batch-load all distinct requester userIds from User model
    const requesterIds = [
      ...new Set(requests.map((r) => r.userId.toString())),
    ];

    const users = await User.find({ _id: { $in: requesterIds } })
      .select("name image") // image must exist per your model/business rule
      .lean();

    const userMap = new Map(
      users.map((u) => [u._id.toString(), { _id: u._id, name: u.name, image: u.image }])
    );

    // Group requests by group
    const groupedRequests = groups.map((groupItem) => {
      const reqsForGroup = requests.filter(
        (r) =>
          (r.classId?._id || r.classId).toString() === groupItem._id.toString()
      );

      const shaped = reqsForGroup.map((r) => {
        const u = userMap.get(r.userId.toString());
        return {
          _id: r._id,
          user: {
            _id: u?._id || r.userId,
            name: u?.name ?? "",       // from User model
            image: u?.image ?? null,   // from User model (should be present)
          },
          status: r.status,
          requestedAt: r.requestedAt,
        };
      });

      return {
        groupId: groupItem._id,
        groupName: groupItem.group.name,
        requests: shaped,
      };
    });

    // Remove groups with zero requests
    let filteredGroupedRequests = groupedRequests.filter(
      (g) => g.requests.length > 0
    );

    // Sort by latest request date within each group (desc)
    filteredGroupedRequests.sort((a, b) => {
      const aLatest = a.requests[0]?.requestedAt || new Date(0);
      const bLatest = b.requests[0]?.requestedAt || new Date(0);
      return new Date(bLatest) - new Date(aLatest);
    });

    // Pagination
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const paginated = filteredGroupedRequests.slice(skip, skip + limit);

    res.json({ groups: paginated });
  } catch (error) {
    console.error("Error fetching group join requests:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};


export const approveJoinRequest = async (req, res) => {
  try {
    const request = await JoinRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ message: "Request not found" });

    request.status = "approved";
    await request.save();

    res.json({ success: true, request });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const rejectJoinRequest = async (req, res) => {
  try {
    const request = await JoinRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ message: "Request not found" });

    request.status = "rejected";
    await request.save();

    res.json({ success: true, request });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
