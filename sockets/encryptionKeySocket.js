import Conversation from "../models/conversationModel.js";
import { isValidObjectId } from "mongoose";
import logger from "../utils/logger.js";

/**
 * Register encryption key socket handlers
 * Provides real-time key exchange with API fallback support
 */
export const registerEncryptionKeyHandlers = (io, socket) => {
  const userId = socket.user?._id || socket.user?.id;

  logger.info({ userId, socketId: socket.id }, "🔐 Encryption key handlers registered for user");

  // Exchange public key via socket (replaces API call)
  socket.on("encryption:exchange-key", async ({ conversationId, publicKey }, callback) => {
    logger.info({ 
      userId, 
      conversationId, 
      hasCallback: !!callback,
      publicKeyLength: publicKey?.length 
    }, "📥 Received encryption:exchange-key event");
    
    // Ensure callback exists
    if (!callback || typeof callback !== 'function') {
      logger.error("❌ No callback provided for encryption:exchange-key");
      return;
    }
    
    try {
      if (!isValidObjectId(conversationId)) {
        return callback?.({
          success: false,
          message: "Invalid conversation ID format"
        });
      }

      if (!publicKey || typeof publicKey !== 'string') {
        return callback?.({
          success: false,
          message: 'Public key is required and must be a string'
        });
      }

      const conversation = await Conversation.findById(conversationId);
      
      if (!conversation) {
        return callback?.({
          success: false,
          message: "Conversation not found"
        });
      }

      // Check if user is participant
      const isParticipant = conversation.participants.some(
        (participantId) => participantId.toString() === userId.toString()
      );

      if (!isParticipant) {
        return callback?.({
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

      // Get current keys or start fresh
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

      logger.info({ 
        conversationId, 
        userId, 
        keyVersion: currentVersion + 1 
      }, "🔐 Key exchanged via socket");

      callback?.({
        success: true,
        message: "Public key exchanged successfully via socket",
        data: {
          conversationId: conversationId,
          keyId: keyId,
          keyVersion: currentVersion + 1,
          exchangeStatus: conversation.keyExchange.status,
          participantsWithKeys: participantsWithKeys,
          totalParticipants: totalParticipants
        }
      });

      // Notify other participants in the conversation
      socket.to(`conv:${conversationId}`).emit("encryption:key-updated", {
        conversationId,
        userId: userId.toString(),
        publicKey,
        keyId,
        keyVersion: currentVersion + 1,
        timestamp: new Date()
      });

    } catch (error) {
      logger.error({ 
        error: error.message, 
        stack: error.stack,
        conversationId, 
        userId 
      }, "❌ Socket key exchange error");
      
      const errorResponse = {
        success: false,
        message: "Failed to exchange key: " + error.message,
        error: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      };
      
      logger.info({ errorResponse }, "📤 Sending error response");
      
      callback(errorResponse);
    }
  });

  // Fetch participant keys via socket (real-time)
  socket.on("encryption:fetch-keys", async ({ conversationId }, callback) => {
    try {
      if (!isValidObjectId(conversationId)) {
        return callback?.({
          success: false,
          message: "Invalid conversation ID format"
        });
      }

      const conversation = await Conversation.findById(conversationId);
      
      if (!conversation) {
        return callback?.({
          success: false,
          message: "Conversation not found"
        });
      }

      // Verify user is participant
      const isParticipant = conversation.participants.some(
        p => p.toString() === userId.toString()
      );

      if (!isParticipant) {
        return callback?.({
          success: false,
          message: "You are not a participant in this conversation"
        });
      }

      // Collect all participants' keys EXCEPT current user
      const participantKeys = [];
      const participantsMap = conversation.keyExchange?.participants;

      if (participantsMap) {
        const mapEntries = participantsMap instanceof Map 
          ? Array.from(participantsMap.entries())
          : Object.entries(participantsMap);

        for (const [participantId, keyData] of mapEntries) {
          if (participantId === userId.toString()) continue;
          if (!keyData) continue;

          // Handle both array format (new) and single key format (legacy)
          if (Array.isArray(keyData)) {
            const activeKey = keyData.find(k => k.isActive);
            if (activeKey && activeKey.publicKey) {
              participantKeys.push({
                userId: participantId,
                publicKey: activeKey.publicKey,
                keyId: activeKey.keyId,
                keyVersion: activeKey.keyVersion,
                exchangedAt: activeKey.exchangedAt,
                // Send ALL keys for fallback decryption (sorted newest first)
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
            participantKeys.push({
              userId: participantId,
              publicKey: keyData.publicKey,
              keyId: keyData.keyId,
              keyVersion: keyData.keyVersion,
              exchangedAt: keyData.exchangedAt,
              // Legacy format: single key
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

      logger.info({ 
        conversationId, 
        userId, 
        keysFound: participantKeys.length 
      }, "🔐 Fetched encryption keys via socket");

      callback?.({
        success: true,
        data: {
          conversationId,
          keys: participantKeys,
          exchangeStatus: conversation.keyExchange?.status || "none"
        }
      });

    } catch (error) {
      logger.error({ error, conversationId, userId }, "❌ Socket fetch keys error");
      callback?.({
        success: false,
        message: "Failed to fetch keys",
        error: error.message
      });
    }
  });

  // New key generated - notify other participants
  socket.on("encryption:key-generated", async ({ conversationId, publicKey, keyId, keyVersion }) => {
    try {
      if (!isValidObjectId(conversationId)) {
        return socket.emit("encryption:error", {
          message: "Invalid conversation ID"
        });
      }

      const conversation = await Conversation.findById(conversationId);
      
      if (!conversation) {
        return socket.emit("encryption:error", {
          message: "Conversation not found"
        });
      }

      // Verify user is participant
      const isParticipant = conversation.participants.some(
        p => p.toString() === userId.toString()
      );

      if (!isParticipant) {
        return socket.emit("encryption:error", {
          message: "You are not a participant"
        });
      }

      // Notify other participants in the conversation
      socket.to(`conv:${conversationId}`).emit("encryption:key-updated", {
        conversationId,
        userId: userId.toString(),
        publicKey,
        keyId,
        keyVersion,
        timestamp: new Date()
      });

      logger.info({ 
        conversationId, 
        userId, 
        keyVersion 
      }, "🔑 Broadcasted new key to conversation");

    } catch (error) {
      logger.error({ error, conversationId, userId }, "❌ Key generation broadcast error");
      socket.emit("encryption:error", {
        message: "Failed to broadcast key update"
      });
    }
  });

  // Verify if user's key is stored on server
  socket.on("encryption:verify-key", async ({ conversationId }, callback) => {
    try {
      if (!isValidObjectId(conversationId)) {
        return callback?.({
          success: false,
          verified: false,
          message: "Invalid conversation ID"
        });
      }

      const conversation = await Conversation.findById(conversationId);
      
      if (!conversation) {
        return callback?.({
          success: false,
          verified: false,
          message: "Conversation not found"
        });
      }

      const userKeyData = conversation.keyExchange?.participants?.get(userId.toString());
      
      let hasValidKey = false;
      let keyInfo = null;

      if (userKeyData) {
        if (Array.isArray(userKeyData)) {
          const activeKey = userKeyData.find(k => k.isActive);
          hasValidKey = activeKey && activeKey.publicKey;
          if (hasValidKey) {
            keyInfo = {
              keyId: activeKey.keyId,
              keyVersion: activeKey.keyVersion,
              exchangedAt: activeKey.exchangedAt
            };
          }
        } else if (userKeyData.publicKey) {
          hasValidKey = true;
          keyInfo = {
            keyId: userKeyData.keyId,
            keyVersion: userKeyData.keyVersion,
            exchangedAt: userKeyData.exchangedAt
          };
        }
      }

      logger.info({ 
        conversationId, 
        userId, 
        verified: hasValidKey 
      }, "🔍 Verified key storage");

      callback?.({
        success: true,
        verified: hasValidKey,
        keyInfo,
        message: hasValidKey 
          ? "Your key is stored on server" 
          : "No key found on server"
      });

    } catch (error) {
      logger.error({ error, conversationId, userId }, "❌ Key verification error");
      callback?.({
        success: false,
        verified: false,
        message: "Failed to verify key",
        error: error.message
      });
    }
  });

  // V1 Encryption Key Exchange
  socket.on("v1:exchange-key", async ({ conversationId, v1Key }, callback) => {
    logger.info({ 
      userId, 
      conversationId, 
      hasCallback: !!callback,
      v1KeyLength: v1Key?.length 
    }, "📥 Received v1:exchange-key event");
    
    if (!callback || typeof callback !== 'function') {
      logger.error("❌ No callback provided for v1:exchange-key");
      return;
    }
    
    try {
      if (!isValidObjectId(conversationId)) {
        return callback({
          success: false,
          message: "Invalid conversation ID format"
        });
      }

      if (!v1Key || typeof v1Key !== 'string' || v1Key.length < 16) {
        return callback({
          success: false,
          message: 'V1 key must be at least 16 characters'
        });
      }

      const conversation = await Conversation.findById(conversationId);
      
      if (!conversation) {
        return callback({
          success: false,
          message: "Conversation not found"
        });
      }

      // Check if user is participant
      const isParticipant = conversation.participants.some(
        (participantId) => participantId.toString() === userId.toString()
      );

      if (!isParticipant) {
        return callback({
          success: false,
          message: "You are not a participant in this conversation"
        });
      }

      // Initialize v1Keys if not exists
      if (!conversation.v1Keys) {
        conversation.v1Keys = new Map();
      }

      // Store V1 key for this user
      conversation.v1Keys.set(userId.toString(), {
        key: v1Key,
        updatedAt: new Date()
      });

      // Mark the path as modified to ensure Mongoose saves the Map
      conversation.markModified('v1Keys');

      await conversation.save();

      logger.info({ 
        conversationId, 
        userId 
      }, "🔐 V1 key exchanged via socket");

      callback({
        success: true,
        message: "V1 key saved successfully",
        data: {
          conversationId,
          userId: userId.toString()
        }
      });

      // Notify other participants
      socket.to(`conv:${conversationId}`).emit("v1:key-updated", {
        conversationId,
        userId: userId.toString(),
        timestamp: new Date()
      });

    } catch (error) {
      logger.error({ 
        error: error.message, 
        stack: error.stack,
        conversationId, 
        userId 
      }, "❌ V1 key exchange error");
      
      callback({
        success: false,
        message: "Failed to save V1 key: " + error.message,
        error: error.message
      });
    }
  });

  logger.info({ userId }, "🔐 Encryption key handlers registered");
};
