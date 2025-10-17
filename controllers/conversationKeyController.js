import Conversation from "../models/conversationModel.js";
import { isValidObjectId } from "mongoose";

// Exchange public key for a specific conversation
export const exchangeConversationKey = async (req, res) => {
  try {
    const userId = req.user._id;
    const { conversationId } = req.params;
    const { publicKey } = req.body;

    if (!isValidObjectId(conversationId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid conversation ID format"
      });
    }

    if (!publicKey || typeof publicKey !== "string") {
      return res.status(400).json({
        success: false,
        message: "Public key is required and must be a string"
      });
    }

    // Validate base64 format
    try {
      atob(publicKey);
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: "Invalid public key format (must be base64)"
      });
    }

    // Find conversation and verify user is participant
    const conversation = await Conversation.findById(conversationId);
    
    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: "Conversation not found"
      });
    }

    console.log('🔍 Found conversation:', {
      id: conversation._id,
      participantsCount: conversation.participants?.length,
      hasKeyExchange: !!conversation.keyExchange,
      keyExchangeStatus: conversation.keyExchange?.status
    });

    // Check if user is participant
    const isParticipant = conversation.participants.some(
      (participantId) => participantId.toString() === userId.toString()
    );

    if (!isParticipant) {
      return res.status(403).json({
        success: false,
        message: "You are not a participant in this conversation"
      });
    }

    console.log('✅ User is participant');

    // Generate unique key identifier
    const keyId = `key_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Initialize keyExchange if not exists
    if (!conversation.keyExchange) {
      console.log('🆕 Initializing keyExchange object');
      conversation.keyExchange = {
        status: "none",
        participants: new Map(),
        createdAt: null,
        lastActivity: null
      };
    }

    // Ensure participants Map exists
    if (!conversation.keyExchange.participants) {
      console.log('🆕 Initializing participants Map');
      conversation.keyExchange.participants = new Map();
    }

    console.log('📋 Current keyExchange state:', {
      status: conversation.keyExchange.status,
      participantsMapSize: conversation.keyExchange.participants?.size || 0,
      participantsMapType: conversation.keyExchange.participants?.constructor?.name
    });

    // Get current version or start at 1
    const currentParticipant = conversation.keyExchange.participants.get(userId.toString());
    const currentVersion = currentParticipant ? currentParticipant.keyVersion : 0;

    // Update user's public key for this conversation
    conversation.keyExchange.participants.set(userId.toString(), {
      publicKey: publicKey,
      keyId: keyId,
      keyVersion: currentVersion + 1,
      exchangedAt: new Date(),
      lastRotated: currentParticipant ? new Date() : null
    });

    // Update status based on participants
    const totalParticipants = conversation.participants.length;
    const participantsWithKeys = conversation.keyExchange.participants.size;

    if (participantsWithKeys === 1) {
      conversation.keyExchange.status = "partial";
    } else if (participantsWithKeys === totalParticipants) {
      conversation.keyExchange.status = "complete";
    }

    // Set timestamps
    if (!conversation.keyExchange.createdAt) {
      conversation.keyExchange.createdAt = new Date();
    }
    conversation.keyExchange.lastActivity = new Date();

    // Mark the path as modified to ensure Mongoose saves the Map
    conversation.markModified('keyExchange');
    conversation.markModified('keyExchange.participants');

    console.log('💾 Saving conversation with keyExchange:', {
      conversationId,
      userId: userId.toString(),
      participantsMapSize: conversation.keyExchange.participants.size,
      status: conversation.keyExchange.status
    });

    await conversation.save();

    console.log('✅ Conversation saved successfully');

    res.status(200).json({
      success: true,
      message: "Public key exchanged successfully",
      data: {
        conversationId: conversationId,
        keyId: keyId,
        keyVersion: currentVersion + 1,
        exchangeStatus: conversation.keyExchange.status,
        participantsWithKeys: participantsWithKeys,
        totalParticipants: totalParticipants
      }
    });

  } catch (error) {
    console.error("❌ Exchange conversation key error:", error);
    console.error("Error stack:", error.stack);
    console.error("Error name:", error.name);
    
    // Handle validation errors specifically
    if (error.name === 'ValidationError') {
      console.error("Validation errors:", error.errors);
      return res.status(400).json({
        success: false,
        message: "Validation error",
        errors: Object.keys(error.errors).map(key => ({
          field: key,
          message: error.errors[key].message
        }))
      });
    }
    
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message
    });
  }
};

// Get participant's public key for a conversation
export const getParticipantKey = async (req, res) => {
  try {
    const currentUserId = req.user._id;
    const { conversationId, userId } = req.params;
    console.log('🔍 getParticipantKey request:', {
      conversationId,
      requestedUserId: userId,
      currentUserId: currentUserId.toString()
    });

    if (!isValidObjectId(conversationId) || !isValidObjectId(userId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid conversation ID or user ID format"
      });
    }

    // Find conversation and verify current user is participant
    const conversation = await Conversation.findById(conversationId)
      .populate('participants', '_id name');
    
    if (!conversation) {
      console.log('❌ Conversation not found');
      return res.status(404).json({
        success: false,
        message: "Conversation not found"
      });
    }

    console.log('✅ Conversation found:', {
      id: conversation._id,
      participantsCount: conversation.participants?.length,
      hasKeyExchange: !!conversation.keyExchange,
      keyExchangeStatus: conversation.keyExchange?.status,
      participantsWithKeys: conversation.keyExchange?.participants?.size || 0
    });

    // Check if current user is participant
    const isCurrentUserParticipant = conversation.participants.some(
      (participant) => participant._id.toString() === currentUserId.toString()
    );

    if (!isCurrentUserParticipant) {
      console.log('❌ Current user is not a participant');
      return res.status(403).json({
        success: false,
        message: "You are not a participant in this conversation"
      });
    }

    // Check if requested user is participant
    const targetUser = conversation.participants.find(
      (participant) => participant._id.toString() === userId.toString()
    );

    if (!targetUser) {
      console.log('❌ Requested user is not a participant');
      return res.status(404).json({
        success: false,
        message: "Requested user is not a participant in this conversation"
      });
    }

    // Get user's public key for this conversation
    const userKeyData = conversation.keyExchange?.participants?.get(userId.toString());

    console.log('🔑 Looking for key:', {
      userId: userId.toString(),
      hasKeyExchange: !!conversation.keyExchange,
      hasParticipantsMap: !!conversation.keyExchange?.participants,
      participantsMapKeys: conversation.keyExchange?.participants ? Array.from(conversation.keyExchange.participants.keys()) : [],
      userKeyData: userKeyData ? 'Found' : 'Not found'
    });

    if (!userKeyData || !userKeyData.publicKey) {
      console.log('❌ No public key found for user');
      return res.status(404).json({
        success: false,
        message: "No public key found for this user in this conversation"
      });
    }

    console.log('✅ Public key found, returning to client');

    res.status(200).json({
      success: true,
      message: "Participant key retrieved successfully",
      data: {
        conversationId: conversationId,
        userId: userId,
        userName: targetUser.name,
        publicKey: userKeyData.publicKey,
        keyId: userKeyData.keyId,
        keyVersion: userKeyData.keyVersion,
        exchangedAt: userKeyData.exchangedAt,
        lastRotated: userKeyData.lastRotated
      }
    });

  } catch (error) {
    console.error("Get participant key error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message
    });
  }
};

// Get all participants' keys for a conversation
export const getConversationKeys = async (req, res) => {
  try {
    const currentUserId = req.user._id;
    const { conversationId } = req.params;

    if (!isValidObjectId(conversationId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid conversation ID format"
      });
    }

    // Find conversation and verify current user is participant
    const conversation = await Conversation.findById(conversationId)
      .populate('participants', '_id name');
    
    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: "Conversation not found"
      });
    }

    // Check if current user is participant
    const isCurrentUserParticipant = conversation.participants.some(
      (participant) => participant._id.toString() === currentUserId.toString()
    );

    if (!isCurrentUserParticipant) {
      return res.status(403).json({
        success: false,
        message: "You are not a participant in this conversation"
      });
    }

    // Collect all participants' keys
    const participantKeys = [];
    
    if (conversation.keyExchange?.participants) {
      for (const [userId, keyData] of conversation.keyExchange.participants) {
        const participant = conversation.participants.find(p => p._id.toString() === userId);
        
        if (participant && keyData.publicKey) {
          participantKeys.push({
            userId: userId,
            userName: participant.name,
            publicKey: keyData.publicKey,
            keyId: keyData.keyId,
            keyVersion: keyData.keyVersion,
            exchangedAt: keyData.exchangedAt,
            lastRotated: keyData.lastRotated
          });
        }
      }
    }

    res.status(200).json({
      success: true,
      message: "Conversation keys retrieved successfully",
      data: {
        conversationId: conversationId,
        exchangeStatus: conversation.keyExchange?.status || "none",
        totalParticipants: conversation.participants.length,
        participantsWithKeys: participantKeys.length,
        keys: participantKeys,
        createdAt: conversation.keyExchange?.createdAt,
        lastActivity: conversation.keyExchange?.lastActivity
      }
    });

  } catch (error) {
    console.error("Get conversation keys error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message
    });
  }
};

// Rotate user's key for a specific conversation
export const rotateConversationKey = async (req, res) => {
  try {
    const userId = req.user._id;
    const { conversationId } = req.params;
    const { newPublicKey } = req.body;

    if (!isValidObjectId(conversationId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid conversation ID format"
      });
    }

    if (!newPublicKey || typeof newPublicKey !== "string") {
      return res.status(400).json({
        success: false,
        message: "New public key is required and must be a string"
      });
    }

    // Validate base64 format
    try {
      atob(newPublicKey);
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: "Invalid public key format (must be base64)"
      });
    }

    // Find conversation and verify user is participant
    const conversation = await Conversation.findById(conversationId);
    
    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: "Conversation not found"
      });
    }

    // Check if user is participant
    const isParticipant = conversation.participants.some(
      (participantId) => participantId.toString() === userId.toString()
    );

    if (!isParticipant) {
      return res.status(403).json({
        success: false,
        message: "You are not a participant in this conversation"
      });
    }

    // Check if user has existing key
    const currentKeyData = conversation.keyExchange?.participants?.get(userId.toString());
    
    if (!currentKeyData) {
      return res.status(404).json({
        success: false,
        message: "No existing key found for rotation. Use key exchange first."
      });
    }

    // Generate new key identifier
    const newKeyId = `key_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Update with rotated key
    conversation.keyExchange.participants.set(userId.toString(), {
      ...currentKeyData,
      publicKey: newPublicKey,
      keyId: newKeyId,
      keyVersion: currentKeyData.keyVersion + 1,
      lastRotated: new Date()
    });

    conversation.keyExchange.lastActivity = new Date();

    await conversation.save();

    res.status(200).json({
      success: true,
      message: "Conversation key rotated successfully",
      data: {
        conversationId: conversationId,
        newKeyId: newKeyId,
        newKeyVersion: currentKeyData.keyVersion + 1,
        rotatedAt: new Date(),
        exchangeStatus: conversation.keyExchange.status
      }
    });

  } catch (error) {
    console.error("Rotate conversation key error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message
    });
  }
};