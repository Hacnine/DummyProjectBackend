import { Server } from 'socket.io';
import cookie from 'cookie';
import jwt from 'jsonwebtoken';
import { registerSocketEvents } from './handlers.js';

export const initSocketServer = (server) => {
  const io = new Server(server, {
    cors: {
      origin: process.env.ORIGIN_URL || "http://localhost:3002",
      credentials: true,
    },
  });

  io.use((socket, next) => {
    const cookies = socket.handshake.headers.cookie;
    if (!cookies) return next(new Error("No cookies found"));

    const { access_token: token } = cookie.parse(cookies);
    if (!token) return next(new Error("No token found"));

    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
      if (err) return next(new Error("Invalid token"));
      socket.user = decoded;
      next();
    });
  });

  io.on("connection", (socket) => {
    registerSocketEvents(io, socket);
  });

  return io;
};