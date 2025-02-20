import express from 'express';
import { createConversation, getAllConversations, acceptMessageRequest, deleteMessageRequest  } from '../controllers/conversationController.js';

const router = express.Router();

router.post('/', createConversation);
router.get('/:userId', getAllConversations); 
router.patch("/accept-request/:conversationId", acceptMessageRequest);
router.delete("/delete-request/:conversationId", deleteMessageRequest);

export default router;