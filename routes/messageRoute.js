import express from 'express';
import { sendMessage,getMessages } from '../controllers/messageController.js';

const router = express.Router();

router.get('/:conversationId', getMessages);
router.get('/getmessages-by-participants', getMessages);
router.post('/:conversationId', sendMessage);

export default router;