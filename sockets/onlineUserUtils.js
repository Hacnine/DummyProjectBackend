export const ONLINE_USERS_KEY = 'onlineUsers';
export const USER_SOCKET_MAP_KEY = 'userSocketMap';
export const USER_DATA_CACHE_KEY = 'userDataCache';

export const addOnlineUser = async (redisClient, userId, socketId, userModel) => {
  await redisClient.sAdd(ONLINE_USERS_KEY, userId);
  await redisClient.hSet(USER_SOCKET_MAP_KEY, userId, socketId);

  const exists = await redisClient.hExists(USER_DATA_CACHE_KEY, userId);
  if (!exists) {
    const user = await userModel.findById(userId, "-password");
    if (user) {
      await redisClient.hSet(USER_DATA_CACHE_KEY, userId, JSON.stringify(user));
    }
  }
};

export const removeOnlineUser = async (redisClient, userId) => {
  await redisClient.sRem(ONLINE_USERS_KEY, userId);
  await redisClient.hDel(USER_SOCKET_MAP_KEY, userId);
};

export const sendOnlineUsersList = async (io, redisClient) => {
  const userIds = await redisClient.sMembers(ONLINE_USERS_KEY);
  const loggedUsers = [];

  for (const userId of userIds) {
    const userData = await redisClient.hGet(USER_DATA_CACHE_KEY, userId);
    if (userData) {
      loggedUsers.push(JSON.parse(userData));
    }
  }

  for (const userId of userIds) {
    const socketId = await redisClient.hGet(USER_SOCKET_MAP_KEY, userId);
    if (socketId) {
      io.to(socketId).emit(
        "loggedUsersUpdate",
        loggedUsers.filter(u => u._id.toString() !== userId)
      );
    }
  }
};
