import express from 'express';
import { createConversation, getAllConversations, getConversationById, updateMessageRequestStatus  } from '../controllers/conversationController.js';
import { isLogin } from "../middlewares/auth.middleware.js";

const router = express.Router();

router.post('/', isLogin, createConversation);
router.get('/:userId', isLogin, getAllConversations); 
router.get('/chat/:chatId', isLogin, getConversationById);
router.patch("/update-message-request-status/:conversationId", isLogin, updateMessageRequestStatus);

export default router;