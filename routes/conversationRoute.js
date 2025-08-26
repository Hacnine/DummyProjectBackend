import express from 'express';
import { approveJoinRequest, createConversation, createGroup, deleteConversation, getAllConversations, getConversationById, getGroupJoinRequests, getPendingConversations, rejectJoinRequest, searchGroups, updateConversationThemeIndex, updateMessageRequestStatus  } from '../controllers/conversationController.js';
import { isLogin } from "../middlewares/auth.middleware.js";
import { getClassJoinRequests } from '../controllers/classController.js';

const router = express.Router();
router.use(isLogin)

router.post('/', createConversation);
router.post('/create-group', createGroup);
router.get('/chat/:chatId', getConversationById);
router.get('/search-groups', searchGroups);

router.patch("/update-message-request-status/:conversationId", updateMessageRequestStatus);
router.patch("/:id/theme-index", updateConversationThemeIndex);
router.delete("/conversation/:id", deleteConversation);

router.get('/pending', getPendingConversations);
router.get('/groups', getGroupJoinRequests)
router.get('/classes', getClassJoinRequests)

router.post("/requests/:id/approve", approveJoinRequest);
router.post("/requests/:id/reject", rejectJoinRequest);


router.get('/:userId', getAllConversations); 


export default router;