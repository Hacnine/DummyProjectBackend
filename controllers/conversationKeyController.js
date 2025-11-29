import Conversation from "../models/conversationModel.js";
import { isValidObjectId } from "mongoose";

// Exchange public key for a specific conversation
export const exchangeConversationKey = async (req, res) => {

  try {
    const userId = req.user._id;
    const { conversationId } = req.params;

    // Ensure publicKey is declared before assignment to avoid ReferenceError
    let publicKey;

    if (typeof req.body === 'string') {
      publicKey = req.body;
    } else if (Buffer.isBuffer(req.body)) {
      publicKey = req.body.toString();
    } else if (typeof req.body === 'object' && req.body.publicKey) {
      publicKey = req.body.publicKey;
    } else {
      publicKey = undefined;
    }
  // Optionally validate publicKey
  if (!publicKey || typeof publicKey !== 'string') {

    return res.status(400).json({
      success: false,
      message: 'Public key is required and must be a string'
    });
  }
// console.log(conversationId)
    if (!isValidObjectId(conversationId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid conversation ID format"
      });
    }

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


    // Generate unique key identifier
    const keyId = `key_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Initialize keyExchange if not exists
    if (!conversation.keyExchange) {

      conversation.keyExchange = {
        status: "none",
        participants: new Map(),
        createdAt: null,
        lastActivity: null
      };
    }

    // Ensure participants Map exists
    if (!conversation.keyExchange.participants) {

      conversation.keyExchange.participants = new Map();
    }

    // Get current version or start at 1
    const currentParticipant = conversation.keyExchange.participants.get(userId.toString());
    let currentVersion = 0;
    let keyHistory = [];

    if (currentParticipant) {
      // If participant has keys stored as an array (new format)
      if (Array.isArray(currentParticipant)) {
        keyHistory = currentParticipant;
        const activeKey = keyHistory.find(k => k.isActive);
        currentVersion = activeKey ? activeKey.keyVersion : keyHistory.length;
      } 
      // Legacy format: single key object
      else if (currentParticipant.keyVersion) {
        currentVersion = currentParticipant.keyVersion;
        // Migrate legacy single key to array format
        keyHistory = [{
          publicKey: currentParticipant.publicKey,
          keyId: currentParticipant.keyId,
          keyVersion: currentParticipant.keyVersion,
          exchangedAt: currentParticipant.exchangedAt,
          isActive: false
        }];
      }
    }

    // Mark all previous keys as inactive
    keyHistory.forEach(key => key.isActive = false);

    // Add new key to history
    const newKey = {
      publicKey: publicKey,
      keyId: keyId,
      keyVersion: currentVersion + 1,
      exchangedAt: new Date(),
      isActive: true
    };
    keyHistory.push(newKey);

    // Keep only the last 3 keys for backward compatibility
    if (keyHistory.length > 3) {
      keyHistory = keyHistory.slice(-3);
    }

    // Update user's keys for this conversation (now storing array)
    conversation.keyExchange.participants.set(userId.toString(), keyHistory);

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

    await conversation.save();

  // console.log('✅ Conversation saved successfully');

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


    if (!userKeyData) {
  console.log('❌ No public key found for user');
      return res.status(404).json({
        success: false,
        message: "No public key found for this user in this conversation"
      });
    }

    // Handle both new array format and legacy single key format
    let keyInfo;
    if (Array.isArray(userKeyData)) {
      // New format: array of keys
      const activeKey = userKeyData.find(k => k.isActive);
      if (!activeKey) {
        return res.status(404).json({
          success: false,
          message: "No active key found for this user"
        });
      }
      keyInfo = {
        publicKey: activeKey.publicKey,
        keyId: activeKey.keyId,
        keyVersion: activeKey.keyVersion,
        exchangedAt: activeKey.exchangedAt,
        keyHistory: userKeyData.map(k => ({
          keyId: k.keyId,
          keyVersion: k.keyVersion,
          isActive: k.isActive,
          exchangedAt: k.exchangedAt
        }))
      };
    } else if (userKeyData.publicKey) {
      // Legacy format: single key object
      keyInfo = {
        publicKey: userKeyData.publicKey,
        keyId: userKeyData.keyId,
        keyVersion: userKeyData.keyVersion,
        exchangedAt: userKeyData.exchangedAt,
        lastRotated: userKeyData.lastRotated,
        keyHistory: [{
          keyId: userKeyData.keyId,
          keyVersion: userKeyData.keyVersion,
          isActive: true,
          exchangedAt: userKeyData.exchangedAt
        }]
      };
    } else {
      return res.status(404).json({
        success: false,
        message: "Invalid key data format"
      });
    }

    res.status(200).json({
      success: true,
      message: "Participant key retrieved successfully",
      data: {
        conversationId: conversationId,
        userId: userId,
        userName: targetUser.name,
        ...keyInfo
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

    // Collect all participants' keys EXCEPT the current user.
    // Return as an array suitable for group messaging (no userName required).
    const participantKeys = [];

    const participantsMap = conversation.keyExchange?.participants;

    if (participantsMap) {
      // Support both Map (when stored that way) and plain object
      if (participantsMap instanceof Map) {
        for (const [userId, keyData] of participantsMap.entries()) {
          if (userId === currentUserId.toString()) continue; // skip self
          if (!keyData) continue;

          // Handle both array format (new) and single key format (legacy)
          if (Array.isArray(keyData)) {
            const activeKey = keyData.find(k => k.isActive);
            if (activeKey && activeKey.publicKey) {
              participantKeys.push({
                userId: userId,
                publicKey: activeKey.publicKey,
                keyId: activeKey.keyId,
                keyVersion: activeKey.keyVersion,
                exchangedAt: activeKey.exchangedAt,
                // Send ALL keys (not just history metadata) for fallback decryption
                keys: keyData
                  .sort((a, b) => (b.keyVersion || 0) - (a.keyVersion || 0))
                  .map(k => ({
                    publicKey: k.publicKey,
                    keyId: k.keyId,
                    keyVersion: k.keyVersion,
                    exchangedAt: k.exchangedAt,
                    isActive: k.isActive
                  }))
              });
            }
          } else if (keyData.publicKey) {
            // Legacy format
            participantKeys.push({
              userId: userId,
              publicKey: keyData.publicKey,
              keyId: keyData.keyId,
              keyVersion: keyData.keyVersion,
              exchangedAt: keyData.exchangedAt,
              lastRotated: keyData.lastRotated
            });
          }
        }
      } else if (typeof participantsMap === 'object') {
        for (const [userId, keyData] of Object.entries(participantsMap)) {
          if (userId === currentUserId.toString()) continue; // skip self
          if (!keyData) continue;

          // Handle both array format (new) and single key format (legacy)
          if (Array.isArray(keyData)) {
            const activeKey = keyData.find(k => k.isActive);
            if (activeKey && activeKey.publicKey) {
              participantKeys.push({
                userId: userId,
                publicKey: activeKey.publicKey,
                keyId: activeKey.keyId,
                keyVersion: activeKey.keyVersion,
                exchangedAt: activeKey.exchangedAt,
                // Send ALL keys (not just history metadata) for fallback decryption
                keys: keyData
                  .sort((a, b) => (b.keyVersion || 0) - (a.keyVersion || 0))
                  .map(k => ({
                    publicKey: k.publicKey,
                    keyId: k.keyId,
                    keyVersion: k.keyVersion,
                    exchangedAt: k.exchangedAt,
                    isActive: k.isActive
                  }))
              });
            }
          } else if (keyData.publicKey) {
            // Legacy format
            participantKeys.push({
              userId: userId,
              publicKey: keyData.publicKey,
              keyId: keyData.keyId,
              keyVersion: keyData.keyVersion,
              exchangedAt: keyData.exchangedAt,
              lastRotated: keyData.lastRotated,
              // Wrap single key in array format for consistency
              keys: [{
                publicKey: keyData.publicKey,
                keyId: keyData.keyId,
                keyVersion: keyData.keyVersion,
                exchangedAt: keyData.exchangedAt,
                isActive: true
              }]
            });
          }
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
        // participantsWithKeys here refers to OTHER participants (excluding the requester)
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