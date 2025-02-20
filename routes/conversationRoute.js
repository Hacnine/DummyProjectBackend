import express from 'express';
import { createConversation, getAllConversations  } from '../controllers/conversationController.js';

const router = express.Router();

router.post('/conversations', createConversation);
router.get('/conversations/:userId', getAllConversations); 

export default router;