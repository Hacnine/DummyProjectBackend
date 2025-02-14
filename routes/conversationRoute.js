import express from 'express';
import { createConversation, getConversations, getMessages } from '../controllers/conversationController.js';
import { sendMessage } from '../controllers/messageController.js';
import { acceptMessageRequest } from '../controllers/messageRequestController.js';

const router = express.Router();

router.post('/conversations', createConversation);
router.get('/conversations/:userId', getConversations); 
router.get('/conversations/:conversationId', getMessages);
router.post('/messages/:conversationId', sendMessage);
router.patch("/conversations/accept-request/:conversationId", acceptMessageRequest);


export default router;