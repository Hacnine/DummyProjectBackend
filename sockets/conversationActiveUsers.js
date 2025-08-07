import { onlineUsers } from "./onlineUserSocket.js";

// Conversation-specific active users Map
export const activeUsersByRoom = new Map(); // { conversationId: Map<userId, userData> }

// Send active users list for a specific conversation
export const sendActiveUsersList = (io, conversationId) => {
  const activeUsers = activeUsersByRoom.has(conversationId)
    ? Array.from(activeUsersByRoom.get(conversationId).values())
    : [];
  io.to(conversationId).emit("activeUsersUpdate", activeUsers);
};

// Register conversation-specific user handlers
export const registerConversationActiveUsersHandlers = (io, socket) => {
  const userId = socket.user?.id; // Assuming socket.user.id is set during authentication

  // Handle joinRoom
  socket.on("joinGroupChat", (conversationId, userId) => {
    // Validate userId matches authenticated user
    console.log(conversationId)
    if (userId !== socket.user?.id) {
      console.warn(`Unauthorized join attempt by socket ${socket.id} for user ${userId}`);
      return;
    }

    // Join the Socket.IO room
    socket.join(conversationId);

    // Add user to conversation's active users
    const userData = onlineUsers.get(userId)?.userData;
    if (userData) {
      if (!activeUsersByRoom.has(conversationId)) {
        activeUsersByRoom.set(conversationId, new Map());
      }
      activeUsersByRoom.get(conversationId).set(userId, userData);
      // console.log(`User ${userId} joined room ${conversationId}`);
      sendActiveUsersList(io, conversationId);
    } else {
      console.warn(`No userData found for user ${userId} in joinRoom`);
    }
  });

  // Handle leaveRoom
  socket.on("leaveGroupChat", (conversationId, userId) => {
    // Validate userId
    if (userId !== socket.user?.id) {
      console.warn(`Unauthorized leave attempt by socket ${socket.id} for user ${userId}`);
      return;
    }

    // Leave the Socket.IO room
    socket.leave(conversationId);

    // Remove user from conversation's active users
    if (activeUsersByRoom.has(conversationId)) {
      activeUsersByRoom.get(conversationId).delete(userId);
      if (activeUsersByRoom.get(conversationId).size === 0) {
        activeUsersByRoom.delete(conversationId); // Clean up empty rooms
      }
      // console.log(`User ${userId} left room ${conversationId}`);
      sendActiveUsersList(io, conversationId);
    }
  });

  // Handle disconnect
  socket.on("disconnect", () => {
    if (userId) {
      // Remove from all conversation rooms
      activeUsersByRoom.forEach((userMap, conversationId) => {
        if (userMap.has(userId)) {
          userMap.delete(userId);
          if (userMap.size === 0) {
            activeUsersByRoom.delete(conversationId);
          }
          sendActiveUsersList(io, conversationId);
        }
      });
    }
  });
};