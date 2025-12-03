import Conversation from "../models/conversationModel.js";
import PermissionRequest from "../models/permissionRequestModel.js";

// Get message permissions for a conversation
export const getMessagePermissions = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user._id;

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found" });
    }

    // Check if user is participant
    const isParticipant = conversation.participants.some(
      (p) => p.toString() === userId.toString()
    );
    if (!isParticipant) {
      return res.status(403).json({ message: "Not a participant of this conversation" });
    }

    // Get any pending requests by this user for this conversation
    const pendingRequests = await PermissionRequest.find({
      conversation: conversationId,
      requester: userId,
      status: "pending",
    }).select("permissionType status createdAt");

    // Check if user is admin of the conversation (for groups)
    const isAdmin = conversation.group?.admins?.some(
      (a) => a.toString() === userId.toString()
    ) || false;

    res.status(200).json({
      permissions: conversation.messagePermissions || {
        text: true,
        image: true,
        voice: false,
        video: false,
        file: false,
        sticker: true,
        gif: true,
      },
      pendingRequests,
      isAdmin,
    });
  } catch (error) {
    console.error("Error fetching message permissions:", error);
    res.status(500).json({ message: "Failed to fetch message permissions" });
  }
};

// Request a permission change
export const requestPermission = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { permissionType, reason } = req.body;
    const userId = req.user._id;

    // Validate permission type
    const validTypes = ["text", "image", "voice", "video", "file", "sticker", "gif"];
    if (!validTypes.includes(permissionType)) {
      return res.status(400).json({ message: "Invalid permission type" });
    }

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found" });
    }

    // Check if user is participant
    const isParticipant = conversation.participants.some(
      (p) => p.toString() === userId.toString()
    );
    if (!isParticipant) {
      return res.status(403).json({ message: "Not a participant of this conversation" });
    }

    // Check if permission is already enabled
    const currentPermissions = conversation.messagePermissions || {};
    if (currentPermissions[permissionType] === true) {
      return res.status(400).json({ message: "This permission is already enabled" });
    }

    // Check for existing pending request for same permission
    const existingRequest = await PermissionRequest.findOne({
      conversation: conversationId,
      requester: userId,
      permissionType,
      status: "pending",
    });
    if (existingRequest) {
      return res.status(400).json({ message: "You already have a pending request for this permission" });
    }

    // Create new permission request
    const permissionRequest = new PermissionRequest({
      conversation: conversationId,
      requester: userId,
      permissionType,
      reason: reason || "",
    });

    await permissionRequest.save();

    res.status(201).json({
      message: "Permission request submitted successfully",
      request: permissionRequest,
    });
  } catch (error) {
    console.error("Error requesting permission:", error);
    res.status(500).json({ message: "Failed to submit permission request" });
  }
};

// Get all permission requests for a conversation (admin only)
export const getPermissionRequests = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { status } = req.query;
    const userId = req.user._id;

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found" });
    }

    // Check if user is admin of the conversation
    const isAdmin = conversation.group?.admins?.some(
      (a) => a.toString() === userId.toString()
    );
    if (!isAdmin && req.user.role !== "admin" && req.user.role !== "superadmin") {
      return res.status(403).json({ message: "Not authorized to view permission requests" });
    }

    const query = { conversation: conversationId };
    if (status && ["pending", "approved", "rejected"].includes(status)) {
      query.status = status;
    }

    const requests = await PermissionRequest.find(query)
      .populate("requester", "name email image")
      .populate("reviewedBy", "name")
      .sort({ createdAt: -1 });

    res.status(200).json({ requests });
  } catch (error) {
    console.error("Error fetching permission requests:", error);
    res.status(500).json({ message: "Failed to fetch permission requests" });
  }
};

// Review a permission request (admin only)
export const reviewPermissionRequest = async (req, res) => {
  try {
    const { requestId } = req.params;
    const { action, reviewNote } = req.body;
    const userId = req.user._id;

    if (!["approve", "reject"].includes(action)) {
      return res.status(400).json({ message: "Invalid action. Use 'approve' or 'reject'" });
    }

    const permissionRequest = await PermissionRequest.findById(requestId);
    if (!permissionRequest) {
      return res.status(404).json({ message: "Permission request not found" });
    }

    if (permissionRequest.status !== "pending") {
      return res.status(400).json({ message: "This request has already been reviewed" });
    }

    const conversation = await Conversation.findById(permissionRequest.conversation);
    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found" });
    }

    // Check if user is admin
    const isAdmin = conversation.group?.admins?.some(
      (a) => a.toString() === userId.toString()
    );
    if (!isAdmin && req.user.role !== "admin" && req.user.role !== "superadmin") {
      return res.status(403).json({ message: "Not authorized to review permission requests" });
    }

    // Update request status
    permissionRequest.status = action === "approve" ? "approved" : "rejected";
    permissionRequest.reviewedBy = userId;
    permissionRequest.reviewedAt = new Date();
    permissionRequest.reviewNote = reviewNote || "";
    await permissionRequest.save();

    // If approved, update conversation permissions
    if (action === "approve") {
      const updatePath = `messagePermissions.${permissionRequest.permissionType}`;
      await Conversation.findByIdAndUpdate(permissionRequest.conversation, {
        $set: { [updatePath]: true },
      });
    }

    res.status(200).json({
      message: `Permission request ${action}d successfully`,
      request: permissionRequest,
    });
  } catch (error) {
    console.error("Error reviewing permission request:", error);
    res.status(500).json({ message: "Failed to review permission request" });
  }
};

// Update message permissions (admin only)
export const updateMessagePermissions = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { permissions } = req.body;
    const userId = req.user._id;

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found" });
    }

    // Check if user is admin
    const isAdmin = conversation.group?.admins?.some(
      (a) => a.toString() === userId.toString()
    );
    if (!isAdmin && req.user.role !== "admin" && req.user.role !== "superadmin") {
      return res.status(403).json({ message: "Not authorized to update permissions" });
    }

    // Validate and update permissions
    const validTypes = ["text", "image", "voice", "video", "file", "sticker", "gif"];
    const updates = {};
    for (const [key, value] of Object.entries(permissions)) {
      if (validTypes.includes(key) && typeof value === "boolean") {
        updates[`messagePermissions.${key}`] = value;
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: "No valid permissions to update" });
    }

    const updatedConversation = await Conversation.findByIdAndUpdate(
      conversationId,
      { $set: updates },
      { new: true }
    );

    res.status(200).json({
      message: "Permissions updated successfully",
      permissions: updatedConversation.messagePermissions,
    });
  } catch (error) {
    console.error("Error updating message permissions:", error);
    res.status(500).json({ message: "Failed to update permissions" });
  }
};
