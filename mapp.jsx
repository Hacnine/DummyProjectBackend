import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import axios from 'axios';
import io from 'socket.io-client';

const UserAuthContext = createContext();

// Custom hook to use the UserAuthContext
const useUserAuth = () => useContext(UserAuthContext);

const UserAuthProvider = ({ children }) => {
  const baseUrl = "http://localhost:3001/api/user/";
  const socketUrl = "http://localhost:3001/";

  const [user, setUser] = useState(() => {
    const savedUser = localStorage.getItem('user');
    return savedUser ? JSON.parse(savedUser) : null;
  });

  const [allUsers, setAllUsers] = useState(() => {
    const savedUsers = localStorage.getItem('getAllUsers');
    return savedUsers ? JSON.parse(savedUsers) : [];
  });

  const [onlineUsers, setOnlineUsers] = useState([]);
  
  // Use useRef for socket to persist across renders
  const socketRef = useRef(null);

  // Register User
  const registerUser = useCallback(async (userData) => {
    try {
      const response = await axios.post(`${baseUrl}register/`, userData, {
        headers: { 'Content-type': 'application/json' },
      });
      return response.data;
    } catch (error) {
      console.error("Registration error:", error);
      throw error;
    }
  }, [baseUrl]);

  // Login User
  const loginUser = useCallback(async (userData) => {
    try {
      const response = await axios.post(`${baseUrl}login/`, userData, {
        headers: { 'Content-type': 'application/json' },
        withCredentials: true,
      });

      setUser(response.data.user);
      localStorage.setItem('user', JSON.stringify(response.data.user));

      // Initialize socket connection
      socketRef.current = io(socketUrl, { query: { token: response.data.accessToken } });

      return response.data;
    } catch (error) {
      console.error("Login error:", error);
      throw error;
    }
  }, [baseUrl, socketUrl]);

  // Logout User
  const logoutUser = useCallback(async () => {
    try {
      await axios.get(`${baseUrl}logout/`, { withCredentials: true });
    } catch (error) {
      console.error('Error logging out:', error);
    } finally {
      setUser(null);
      localStorage.removeItem('user');

      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    }
  }, [baseUrl]);

  // Fetch all users
  const getAllUsers = useCallback(async () => {
    try {
      const response = await axios.get(`${baseUrl}allusers/`, { withCredentials: true });
      setAllUsers(response.data);
      localStorage.setItem("getAllUsers", JSON.stringify(response.data));
    } catch (error) {
      console.error("Error fetching users:", error);
      logoutUser();
    }
  }, [baseUrl, logoutUser]);

  // Fetch online users
  const fetchOnlineUsers = useCallback(async () => {
    try {
      const response = await axios.get(`${baseUrl}onlineusers/`, { withCredentials: true });
      setOnlineUsers(response.data);
    } catch (error) {
      console.error("Error fetching online users:", error);
    }
  }, [baseUrl]);

  // Initialize authentication on mount
  useEffect(() => {
    const initializeAuth = async () => {
      try {
        await getAllUsers();
        await fetchOnlineUsers();
      } catch (error) {
        console.error("Error initializing auth:", error);
      }
    };
    initializeAuth();
  }, [getAllUsers, fetchOnlineUsers]);

  // Socket event listeners
  useEffect(() => {
    if (socketRef.current) {
      socketRef.current.on("getAllUsersUpdate", (updatedUsers) => {
        setAllUsers(updatedUsers);
        localStorage.setItem("getAllUsers", JSON.stringify(updatedUsers));
      });

      socketRef.current.on("loggedUsersUpdate", (users) => {
        setOnlineUsers(users);
      });

      return () => {
        socketRef.current.off("getAllUsersUpdate");
        socketRef.current.off("loggedUsersUpdate");
      };
    }
  }, []);

  return (
    <UserAuthContext.Provider value={{
      user,
      allUsers,
      onlineUsers,
      registerUser,
      loginUser,
      logoutUser,
      socket: socketRef.current,
    }}>
      {children}
    </UserAuthContext.Provider>
  );
};

export { UserAuthProvider, useUserAuth };
