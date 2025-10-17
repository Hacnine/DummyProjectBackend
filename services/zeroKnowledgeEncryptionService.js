/**
 * Zero-Knowledge Encryption Service for Backend
 * Handles encrypted messages without knowing algorithms or storing metadata
 * Backend is completely blind to encryption methods used
 */

/**
 * Validates if a string appears to be encrypted (basic format check)
 * No algorithm detection - just checks if it looks like encrypted data
 * @param {string} text - Text to validate
 * @returns {boolean} - True if appears to be encrypted
 */
export function looksEncrypted(text) {
  if (!text || typeof text !== "string") {
    return false;
  }

  // Basic checks for encrypted-like content
  // Minimum length for any reasonable encryption
  if (text.length < 20) {
    return false;
  }

  // Check if it contains mostly base64-like characters
  const base64Pattern = /^[A-Za-z0-9+/=]+$/;
  if (!base64Pattern.test(text)) {
    return false;
  }

  // Check if it's not obviously plain text (no common words)
  const commonWords = ['the', 'and', 'hello', 'hi', 'how', 'what', 'when', 'where'];
  const lowerText = text.toLowerCase();
  const hasCommonWords = commonWords.some(word => lowerText.includes(word));
  
  if (hasCommonWords) {
    return false;
  }

  // If it passes basic checks, assume it's encrypted
  return true;
}

/**
 * Validates encrypted text format without revealing what algorithm was used
 * @param {string} encryptedText - The encrypted text to validate
 * @returns {Object} - Validation result
 */
export function validateEncryptedFormat(encryptedText) {
  const result = {
    isValid: false,
    isEncrypted: false,
    format: 'unknown',
    error: null
  };

  try {
    if (!encryptedText || typeof encryptedText !== "string") {
      result.error = "Text is required and must be a string";
      return result;
    }

    // Check if it looks encrypted
    result.isEncrypted = looksEncrypted(encryptedText);
    
    if (!result.isEncrypted) {
      result.format = 'plaintext';
      result.isValid = true;
      return result;
    }

    // For encrypted text, do minimal validation
    // We don't want to reveal what encryption was used
    
    // Check if it's valid base64 (most encryptions use base64 encoding)
    try {
      atob(encryptedText);
      result.format = 'base64-encoded';
      result.isValid = true;
    } catch (e) {
      // Not base64, but still might be valid encrypted text
      result.format = 'custom-encoding';
      result.isValid = true;
    }

    return result;

  } catch (error) {
    result.error = "Validation failed";
    return result;
  }
}

/**
 * Process message text for storage (zero-knowledge approach)
 * Backend doesn't know or care what encryption is used
 * @param {string} messageText - Message text (plain or encrypted)
 * @returns {Object} - Processed result
 */
export function processMessageForZeroKnowledgeStorage(messageText) {
  const validation = validateEncryptedFormat(messageText);
  
  return {
    text: messageText, // Store as-is, no modification
    isEncrypted: validation.isEncrypted,
    isValid: validation.isValid,
    format: validation.format,
    processedAt: new Date(),
    // No algorithm info, no metadata, no hints about encryption method
  };
}

/**
 * Validates conversation readiness for encryption (without knowing the method)
 * @param {Object} conversation - Conversation object with keyExchange
 * @returns {Object} - Readiness status
 */
export function validateConversationReadiness(conversation) {
  const result = {
    isReady: false,
    status: 'unknown',
    participantsReady: 0,
    totalParticipants: 0,
    error: null
  };

  try {
    if (!conversation) {
      result.error = "Conversation is required";
      return result;
    }

    result.totalParticipants = conversation.participants ? conversation.participants.length : 0;
    
    if (result.totalParticipants === 0) {
      result.error = "No participants found";
      return result;
    }

    // Check key exchange status without looking at actual keys
    if (conversation.keyExchange && conversation.keyExchange.participants) {
      result.participantsReady = conversation.keyExchange.participants.size;
      result.status = conversation.keyExchange.status || 'none';
    } else {
      result.status = 'none';
    }

    // Consider ready if all participants have exchanged something
    result.isReady = result.participantsReady === result.totalParticipants;

    return result;

  } catch (error) {
    result.error = "Validation failed";
    return result;
  }
}

/**
 * Prepare message data for storage with zero-knowledge encryption handling
 * @param {Object} messageData - Base message data
 * @param {string} messageText - Message text
 * @returns {Object} - Enhanced message data
 */
export function enhanceMessageWithZeroKnowledgeEncryption(messageData, messageText) {
  const processed = processMessageForZeroKnowledgeStorage(messageText);
  
  return {
    ...messageData,
    text: processed.text,
    isEncrypted: processed.isEncrypted,
    // No encryption metadata, algorithm info, or any hints
    // Backend remains completely ignorant of encryption methods
  };
}

/**
 * Clean up conversation encryption data (for conversation deletion)
 * @param {Object} conversation - Conversation object
 * @returns {Object} - Cleanup result
 */
export function cleanupConversationEncryption(conversation) {
  const result = {
    cleaned: false,
    keysRemoved: 0,
    error: null
  };

  try {
    if (!conversation) {
      result.error = "Conversation is required";
      return result;
    }

    if (conversation.keyExchange && conversation.keyExchange.participants) {
      result.keysRemoved = conversation.keyExchange.participants.size;
      
      // Clear all key exchange data
      conversation.keyExchange = {
        status: "none",
        participants: new Map(),
        createdAt: null,
        lastActivity: null
      };
      
      result.cleaned = true;
    }

    return result;

  } catch (error) {
    result.error = "Cleanup failed";
    return result;
  }
}

/**
 * Check if message needs encryption based on conversation state
 * @param {Object} conversation - Conversation object
 * @returns {Object} - Encryption requirement status
 */
export function shouldMessageBeEncrypted(conversation) {
  const readiness = validateConversationReadiness(conversation);
  
  return {
    shouldEncrypt: readiness.isReady,
    canEncrypt: readiness.isReady,
    reason: readiness.isReady ? 'ready' : 'not_ready',
    participantsReady: readiness.participantsReady,
    totalParticipants: readiness.totalParticipants,
    status: readiness.status
  };
}

/**
 * Log encryption activity without revealing methods (for debugging)
 * @param {string} action - Action being performed
 * @param {string} conversationId - Conversation ID
 * @param {Object} details - Additional details (sanitized)
 */
export function logEncryptionActivity(action, conversationId, details = {}) {
  const sanitizedDetails = {
    conversationId: conversationId,
    action: action,
    timestamp: new Date(),
    participantsCount: details.participantsCount || 'unknown',
    status: details.status || 'unknown',
    // No sensitive data, no algorithm info, no key data
  };

  // For debugging - can be removed in production
  console.log(`[Zero-Knowledge Encryption] ${action}:`, sanitizedDetails);
  
  return sanitizedDetails;
}