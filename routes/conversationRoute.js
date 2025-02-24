import express from 'express';
import { createConversation, getAllConversations, getConversationById, updateMessageRequestStatus  } from '../controllers/conversationController.js';

const router = express.Router();

router.post('/', createConversation);
router.get('/:userId', getAllConversations); 
router.get('/chat/:chatId', getConversationById);
router.patch("/update-message-request-status/:conversationId", updateMessageRequestStatus);

export default router;