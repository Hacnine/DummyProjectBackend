import express from 'express';
import { createConversation, getConversations,  } from '../controllers/conversationController.js';
import { sendMessage, acceptMessageRequest,getMessages } from '../controllers/messageController.js';

const router = express.Router();

router.post('/conversations', createConversation);
router.get('/conversations/:userId', getConversations); 
router.get('/conversations/:conversationId', getMessages);
router.post('/messages/:conversationId', sendMessage);
router.patch("/conversations/accept-request/:conversationId", acceptMessageRequest);


export default router;