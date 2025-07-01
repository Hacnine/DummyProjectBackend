export const onlineUsers = new Map(); // userId -> { socketId, userData }

export const addOnlineUser = async (userId, socketId, userModel) => {
  // Optionally fetch user data if not present
  let userData = onlineUsers.get(userId)?.userData;
  if (!userData) {
    const user = await userModel.findById(userId, "-password");
    userData = user ? user.toObject() : null;
  }
  if (userData) {
    onlineUsers.set(userId, { socketId, userData });
  }
};

export const removeOnlineUser = (userId) => {
  onlineUsers.delete(userId);
};

export const sendOnlineUsersList = (io) => {
  const loggedUsers = Array.from(onlineUsers.values()).map(u => u.userData);
  for (const [userId, { socketId }] of onlineUsers.entries()) {
    io.to(socketId).emit(
      "loggedUsersUpdate",
      loggedUsers.filter(u => u._id.toString() !== userId)
    );
  }
};