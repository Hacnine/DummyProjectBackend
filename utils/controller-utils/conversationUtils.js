

// Utility function to format a conversation consistently
export const formatConversation = (convo, userId) => {
  // Find unread count for this user
  const unreadEntry = convo.unread_messages?.find(
    (entry) => entry.user.toString() === userId.toString()
  );
  const unreadCount = unreadEntry ? unreadEntry.count : 0;

  if (convo.group?.is_group) {
    return {
      _id: convo._id,
      name: convo.group.name,
      image: convo.group.image || "images/cover/default-group.png",
      last_message: convo.last_message,
      is_group: true,
      conversationType: convo.group.type || "group",
      participants: convo.participants.map((user) => ({
        _id: user._id,
        name: user.name,
        image: user.image,
      })),
      unreadMessages: unreadCount,
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
        image: user.image,
      })),
      unreadMessages: unreadCount,
    };
  }
};