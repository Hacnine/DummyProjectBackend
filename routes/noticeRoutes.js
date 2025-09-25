import express from "express";

import { requireAuth } from "../middlewares/roleMiddleware.js";
import { createNotice, deleteNotice, getCreatedNotices, getNotices, markNoticeAsRead, resetUnreadCount, toggleLikeNotice, updateNotice } from "../controllers/noticeController.js";

const noticeRouter = express.Router();

// Routes
noticeRouter.post("/", requireAuth, createNotice);
noticeRouter.get("/", requireAuth, getNotices);
noticeRouter.get("/admin-notices/", requireAuth, getCreatedNotices)
noticeRouter.patch("/:noticeId", requireAuth, updateNotice);
noticeRouter.delete("/:noticeId", requireAuth, deleteNotice);
noticeRouter.post("/:noticeId/read", requireAuth, markNoticeAsRead);
noticeRouter.post("/reset-unread", requireAuth, resetUnreadCount);
noticeRouter.post("/:noticeId/like", requireAuth, toggleLikeNotice);
export default noticeRouter;