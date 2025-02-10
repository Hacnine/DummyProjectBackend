import express from 'express';
import { createConversation, getMessages } from '../controllers/conversationController.js';
import { sendMessage } from '../controllers/messageController.js';

const router = express.Router();

router.post('/conversations', createConversation);
router.get('/conversations/:conversationId', getMessages);
router.post('/messages/:conversationId', sendMessage);

export default router;