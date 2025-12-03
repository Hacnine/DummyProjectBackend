import express from 'express';
import { acceptMessageRequest, createConversation, createGroup, deleteConversation, getAllConversations, getConversationById, getGroupJoinRequests, getPendingConversationRequests, getUnreadRequestCounts, searchGroups, updateConversationThemeIndex, updateDisappearingMessages, getDisappearingMessages  } from '../controllers/conversationController.js';
import { isLogin } from "../middlewares/auth.middleware.js";
import { getClassJoinRequests } from '../controllers/classController.js';

const router = express.Router();
router.use(isLogin)

router.post('/', createConversation);
router.post('/create-group', createGroup);
router.get('/chat/:chatId', getConversationById);
router.get('/get-unread-request-count', getUnreadRequestCounts);
router.get('/search-groups', searchGroups);

router.patch("/update-message-request-status/:conversationId", acceptMessageRequest);
router.patch("/:id/theme-index", updateConversationThemeIndex);
router.patch("/:id/disappearing-messages", updateDisappearingMessages);
router.get("/:id/disappearing-messages", getDisappearingMessages);
router.delete("/conversation/:id", deleteConversation);

router.get('/pending', getPendingConversationRequests);
router.get('/groups', getGroupJoinRequests);
router.get('/classes', getClassJoinRequests);

router.get('/:userId', getAllConversations); 


export default router;