import express from 'express';
import { sendMessage,getMessages } from '../controllers/messageController.js';
import { isLogin } from "../middlewares/auth.middleware.js";

const router = express.Router();

router.get('/:conversationId', isLogin, getMessages);
router.get('/getmessages-by-participants', isLogin, getMessages);
router.post('/:conversationId', isLogin, sendMessage);

export default router;


// Ctrl + Alt + Click on a method to open new tab
