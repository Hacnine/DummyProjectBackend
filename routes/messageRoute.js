import express from 'express';
import { sendMessage, acceptMessageRequest,getMessages } from '../controllers/messageController.js';

const router = express.Router();

router.get('/:conversationId', getMessages);
router.post('/:conversationId', sendMessage);
router.patch("/accept-request/:conversationId", acceptMessageRequest);


export default router;