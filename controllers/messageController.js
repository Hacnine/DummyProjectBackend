import Message from '../models/chatModel.js';

const sendMessage = async (req, res) => {
  const { sender, receiver, text } = req.body;
  const newMessage = new Message({
    sender,
    receiver,
    text,
    conversation: req.params.conversationId,
  });
  await newMessage.save();
  req.io.to(receiver).emit('receiveMessage', newMessage);
  res.status(201).json(newMessage);
};

export { sendMessage };