// services/unreadCountService.js
import UnreadCount from "../../models/unreadCountModel.js";

export const incrementUnreadRequest = async (userId, type) => {
  const fieldMap = {
    friend: "unreadFriendRequestCount",
    group: "unreadGroupRequestCount",
    classroom: "unreadClassRequestCount",
  };

  const field = fieldMap[type];
  if (!field) throw new Error(`Invalid request type: ${type}`);

  const unreadCount = await UnreadCount.findOneAndUpdate(
    { user: userId },
    { $inc: { [field]: 1 } },
    { upsert: true, new: true }
  ).lean();

  return {
    unreadFriendRequestCount: unreadCount.unreadFriendRequestCount,
    unreadGroupRequestCount: unreadCount.unreadGroupRequestCount,
    unreadClassRequestCount: unreadCount.unreadClassRequestCount,
  };
};

export const resetUnreadRequests = async (userId, type) => {
  const fieldMap = {
    friend: "unreadFriendRequestCount",
    group: "unreadGroupRequestCount",
    classroom: "unreadClassRequestCount",
  };

  const field = fieldMap[type];
  if (!field) throw new Error(`Invalid request type: ${type}`);

  return await UnreadCount.findOneAndUpdate(
    { user: userId },
    { [field]: 0 },
    { upsert: true, new: true }
  );
};


// Increment unread message count for a conversation

export const incrementUnreadMessage = async (userId, conversationId) => {
  return await UnreadCount.findOneAndUpdate(
    { user: userId, "unreadMessages.conversation": conversationId },
    { $inc: { "unreadMessages.$.count": 1 } },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    }
  ).then(async (doc) => {
    // If conversation not found in array → push a new one
    if (!doc.unreadMessages.some((m) => m.conversation.toString() === conversationId.toString())) {
      doc.unreadMessages.push({ conversation: conversationId, count: 1 });
      await doc.save();
    }
    return doc;
  });
};

// Reset unread messages for a conversation
 
export const resetUnreadMessages = async (userId, conversationId) => {
  const doc = await UnreadCount.findOne({ user: userId });
  if (!doc) return null;

  doc.unreadMessages = doc.unreadMessages.map((m) =>
    m.conversation.toString() === conversationId.toString()
      ? { ...m.toObject(), count: 0 }
      : m
  );

  await doc.save();
  return doc;
};

// Decrement unread messages for a conversation
 
export const decrementUnreadMessage = async (userId, conversationId) => {
  const doc = await UnreadCount.findOne({ user: userId });
  if (!doc) return null;

  doc.unreadMessages = doc.unreadMessages.map((m) =>
    m.conversation.toString() === conversationId.toString()
      ? { ...m.toObject(), count: Math.max(m.count - 1, 0) }
      : m
  );

  await doc.save();
  return doc;
};
