import dotenv from "dotenv";
dotenv.config();
import express from "express";
import userRouter from "./routes/userRoute.js";
import connectDB from "./db/connectdb.js";
import http from 'http';
import { Server } from 'socket.io';

const app = express();
const port = process.env.PORT || "3000";
const DATABASE_URL = process.env.DATABASE_URL;

// JSON Middleware
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server);

// Define the custom namespace
const usp = io.of('/user-namespace');

// Handle connections in the namespace
usp.on('connection', async(socket) => {
  console.log('A user connected to /user-namespace');

  // Listen for custom events (optional)
  socket.on('custom-event', (data) => {
    console.log('Received data:', data);
    // Emit a response
    socket.emit('response-event', { message: 'Hello from server!' });
  });

  // Handle disconnections
  socket.on('disconnect', () => {
    console.log('User disconnected from /user-namespace');
  });
});


app.use('/', userRouter);
connectDB(DATABASE_URL);

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});