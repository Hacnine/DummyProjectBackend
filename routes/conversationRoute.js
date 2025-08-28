import express from 'express';
import { acceptMessageRequest, approveJoinRequest, createConversation, createGroup, deleteConversation, getAllConversations, getConversationById, getGroupJoinRequests, getPendingConversationRequests, getUnreadRequestCounts, rejectJoinRequest, searchGroups, updateConversationThemeIndex  } from '../controllers/conversationController.js';
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
router.delete("/conversation/:id", deleteConversation);

router.get('/pending', getPendingConversationRequests);
router.get('/groups', getGroupJoinRequests)
router.get('/classes', getClassJoinRequests)

router.post("/requests/:id/approve", approveJoinRequest);
router.post("/requests/:id/reject", rejectJoinRequest);


router.get('/:userId', getAllConversations); 


export default router;