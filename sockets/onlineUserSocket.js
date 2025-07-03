import userModel from "../models/userModel.js";

export const onlineUsers = new Map(); 

export const addOnlineUser = async (userId, socketId) => {
  let userData = onlineUsers.get(userId)?.userData;
  if (!userData) {
    const user = await userModel.findById(userId, "name image");
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

export const registerOnlineUserHandlers = (io, socket, userModel) => {
  const userId = socket.user?.id;
  const socketId = socket.id;

  if (userId) {
    addOnlineUser(userId, socketId, userModel).then(() => {
      sendOnlineUsersList(io);
    });
  }

  socket.on("userOnline", async (id) => {
    if (id && !onlineUsers.has(id)) {
      await addOnlineUser(id, socket.id, userModel);
      sendOnlineUsersList(io);
    }
  });

  socket.on("disconnect", () => {
    if (userId) {
      removeOnlineUser(userId);
      sendOnlineUsersList(io);
    }
  });
};
