import Conversation from "../models/conversationModel.js";
import JoinRequest from "../models/joinRequestModel.js";
import User from "../models/userModel.js";
import mongoose from "mongoose";
import { formatConversation } from "../utils/controller-utils/conversationUtils.js";
import { FriendList } from "../models/friendListModel.js";
import UnreadCount from "../models/unreadCountModel.js";

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
       ...(image && { image: image.trim() }),
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


export const getUnreadRequestCounts = async (req, res) => {
  const userId = req.user._id;
  try {
    // Validate input
    if (!userId) {
      return res.status(400).json({ message: 'User ID is required' });
    }

    // Find the unread count document for the user
    let unreadCount = await UnreadCount.findOne({ user: userId })
      .select('unreadFriendRequestCount unreadGroupRequestCount unreadClassRequestCount')
      .lean();

    // If no document exists, create one with default values
    if (!unreadCount) {
      unreadCount = await UnreadCount.create({
        user: userId,
        unreadFriendRequestCount: 0,
        unreadGroupRequestCount: 0,
        unreadClassRequestCount: 0,
        unreadMessages: [],
      });
    }

    // Return only the requested fields
    const response = {
      unreadFriendRequestCount: unreadCount.unreadFriendRequestCount || 0,
      unreadGroupRequestCount: unreadCount.unreadGroupRequestCount || 0,
      unreadClassRequestCount: unreadCount.unreadClassRequestCount || 0,
    };

    return res.status(200).json(response);
  } catch (error) {
    console.error('Error fetching unread counts:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

export const acceptMessageRequest = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { conversationId } = req.params;
    const { status } = req.body;
    const userId = req.user._id;

    if (status !== "accepted") {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: "Invalid status update" });
    }

    // Find the conversation
    const conversation = await Conversation.findById(conversationId).session(
      session
    );
    if (!conversation) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: "Conversation not found" });
    }

    // Must be at index 1
    if (conversation.participants[1].toString() !== userId.toString()) {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(403)
        .json({ message: "You are not authorized to accept this request" });
    }

    // Already accepted check
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

    // Add friends
    const [userA, userB] = conversation.participants;

    await FriendList.updateOne(
      { user: userA },
      { $addToSet: { friends: userB } },
      { upsert: true, session }
    );

    await FriendList.updateOne(
      { user: userB },
      { $addToSet: { friends: userA } },
      { upsert: true, session }
    );

    await session.commitTransaction();
    session.endSession();

    // Notify both participants
    conversation.participants.forEach((participant) => {
      req.io.to(participant.toString()).emit("messageRequestAccepted", {
        conversationId: conversation._id,
        message: `Message request accepted`,
      });
    });

    return res.status(200).json({
      message: "Message request accepted",
      conversation,
    });
  } catch (error) {
    console.error("Error accepting message request:", error);
    await session.abortTransaction();
    session.endSession();
    return res.status(500).json({ message: "Server error" });
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
    res
      .status(500)
      .json({ message: "Server error. Could not delete conversation." });
  }
};

// Update disappearing messages setting for a conversation
export const updateDisappearingMessages = async (req, res) => {
  try {
    const { id } = req.params;
    const { autoDeleteMessagesAfter } = req.body;
    const userId = req.user._id;

    // Validate conversation ID
    if (!id || !mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid conversation ID." });
    }

    // Validate autoDeleteMessagesAfter (must be a positive number, in hours)
    if (
      autoDeleteMessagesAfter === undefined ||
      typeof autoDeleteMessagesAfter !== "number" ||
      autoDeleteMessagesAfter < 0
    ) {
      return res.status(400).json({
        message: "autoDeleteMessagesAfter must be a positive number (hours).",
      });
    }

    // Find conversation
    const conversation = await Conversation.findById(id);
    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found." });
    }

    // Check if user is a participant
    const isParticipant = conversation.participants.some(
      (p) => p.toString() === userId.toString()
    );
    if (!isParticipant) {
      return res
        .status(403)
        .json({ message: "You are not a participant in this conversation." });
    }

    // Update the setting (0 means disabled/off)
    conversation.autoDeleteMessagesAfter = autoDeleteMessagesAfter;
    await conversation.save();

    // Emit socket event to notify participants
    if (req.io) {
      req.io.to(id).emit("disappearingMessagesUpdated", {
        conversationId: id,
        autoDeleteMessagesAfter,
        updatedBy: userId,
      });
    }

    res.status(200).json({
      message: "Disappearing messages setting updated successfully.",
      autoDeleteMessagesAfter: conversation.autoDeleteMessagesAfter,
    });
  } catch (error) {
    console.error("Error updating disappearing messages:", error);
    res.status(500).json({ message: "Server error." });
  }
};

// Get disappearing messages setting for a conversation
export const getDisappearingMessages = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    // Validate conversation ID
    if (!id || !mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid conversation ID." });
    }

    // Find conversation
    const conversation = await Conversation.findById(id).select(
      "participants autoDeleteMessagesAfter"
    );
    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found." });
    }

    // Check if user is a participant
    const isParticipant = conversation.participants.some(
      (p) => p.toString() === userId.toString()
    );
    if (!isParticipant) {
      return res
        .status(403)
        .json({ message: "You are not a participant in this conversation." });
    }

    res.status(200).json({
      autoDeleteMessagesAfter: conversation.autoDeleteMessagesAfter || 24,
    });
  } catch (error) {
    console.error("Error getting disappearing messages:", error);
    res.status(500).json({ message: "Server error." });
  }
};

export const getPendingConversationRequests = async (req, res) => {
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
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit);

    // Process conversations to return required fields
    const formattedConversations = conversations.map((conversation) => {
      // Find the other participant (not the requesting user)
      const otherParticipant = conversation.participants.find(
        (participant) => participant._id.toString() !== userId.toString()
      );

      // Check if the requestor (userId) is at index 0
      const isRequestor =
        conversation.participants[0]._id.toString() === userId.toString();

      // Base response object
      const response = {
        accepter: conversation.participants[1]._id.toString(),
        conversationId: conversation._id,
        name: otherParticipant ? otherParticipant.name : null,
        image: otherParticipant ? otherParticipant.image : null,
      };

      // Include status only if the user is the requestor (at index 0)
      if (isRequestor) {
        response.status = conversation.status;
      }

      return response;
    });

    res.json({
      conversations: formattedConversations,
      totalConversations: await Conversation.countDocuments({
        participants: userId,
        status: "pending",
        "group.is_group": false,
      }),
      page,
      limit,
    });
  } catch (error) {
    console.error("Error fetching pending conversations:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

export const getGroupJoinRequests = async (req, res) => {
  try {
    const userId = req.user._id;

    // Validate userId
    if (!mongoose.isValidObjectId(userId)) {
      return res.status(400).json({ message: "Valid User ID is required" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    let query = {};
    let isRequester = false;

    // Check if user is an admin or moderator
    const groups = await Conversation.find({
      "group.type": "group",
      $or: [{ "group.admins": userId }, { "group.moderators": userId }],
    }).select("_id group.name group.image");

    if (groups.length > 0) {
      query = {
        classId: { $in: groups.map((g) => g._id) },
        status: "pending",
      };
    } else {
      // Non-admins/moderators can only see their own pending join requests
      query = { userId, status: "pending" };
      isRequester = true;
    }

    // Find join requests based on the query
    const requests = await JoinRequest.find(query)
      .populate("userId", "name image")
      .populate("classId", "group.name group.image")
      .sort({ requestedAt: -1 });

    // If the user is the requester, return only group name, date, and image
    if (isRequester) {
      const simplifiedRequests = requests.map((request) => ({
        groupName: request.classId.group.name,
        date: request.requestedAt,
        image: request.userId.image,
      }));

      // Pagination for simplified requests
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 15;
      const skip = (page - 1) * limit;
      const paginatedRequests = simplifiedRequests.slice(skip, skip + limit);

      return res.json({
        requests: paginatedRequests,
        totalRequests: simplifiedRequests.length,
        page,
        limit,
      });
    }

    // For admins/moderators, group requests by group
    const groupMap = {};
    requests.forEach((request) => {
      const groupId = request.classId._id.toString();
      if (!groupMap[groupId]) {
        groupMap[groupId] = {
          groupId: request.classId._id,
          groupName: request.classId.group.name,
          groupImage: request.classId.group.image || null,
          requests: [],
        };
      }
      groupMap[groupId].requests.push({
        _id: request._id,
        user: {
          _id: request.userId._id,
          name: request.userId.name,
          image: request.userId.image,
        },
        status: request.status,
        requestedAt: request.requestedAt,
      });
    });

    // Convert groupMap to array and sort by latest request date
    let groupedRequests = Object.values(groupMap);
    groupedRequests.sort((a, b) => {
      const aLatest = a.requests[0]?.requestedAt || new Date(0);
      const bLatest = b.requests[0]?.requestedAt || new Date(0);
      return new Date(bLatest) - new Date(aLatest);
    });

    // Flatten requests for pagination
    const flattenedRequests = [];
    groupedRequests.forEach((groupItem) => {
      groupItem.requests.forEach((request) => {
        flattenedRequests.push({
          groupId: groupItem.groupId,
          groupName: groupItem.groupName,
          groupImage: groupItem.groupImage,
          request,
        });
      });
    });

    // Pagination based on requests
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 15;
    const skip = (page - 1) * limit;
    const paginatedFlattenedRequests = flattenedRequests.slice(
      skip,
      skip + limit
    );

    // Re-group requests by group
    const result = [];
    const seenGroupIds = new Set();
    paginatedFlattenedRequests.forEach(
      ({ groupId, groupName, groupImage, request }) => {
        const groupIdStr = groupId.toString();
        if (!seenGroupIds.has(groupIdStr)) {
          seenGroupIds.add(groupIdStr);
          result.push({
            groupId,
            groupName,
            groupImage,
            requests: [],
          });
        }
        const groupItem = result.find(
          (item) => item.groupId.toString() === groupIdStr
        );
        groupItem.requests.push(request);
      }
    );

    res.json({
      groups: result,
      totalRequests: flattenedRequests.length,
      page,
      limit,
    });
  } catch (error) {
    console.error("Error fetching group join requests:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};
