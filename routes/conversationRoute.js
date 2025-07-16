import express from 'express';
import { createConversation, createGroup, getAllConversations, getConversationById, searchGroups, updateConversationThemeIndex, updateMessageRequestStatus  } from '../controllers/conversationController.js';
import { isLogin } from "../middlewares/auth.middleware.js";

const router = express.Router();
router.use(isLogin)

router.post('/', createConversation);
router.post('/create-group', createGroup);
router.get('/chat/:chatId', getConversationById);
router.get('/search-groups', searchGroups);

router.patch("/update-message-request-status/:conversationId", updateMessageRequestStatus);
router.patch("/:id/theme-index", updateConversationThemeIndex);



router.get('/:userId', getAllConversations); 


export default router;