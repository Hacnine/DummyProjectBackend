import express from "express";

import { requireAuth } from "../middlewares/roleMiddleware.js";
import { createNotice, deleteNotice, getNotices, updateNotice } from "../controllers/noticeController.js";

const noticeRouter = express.Router();

// Routes
noticeRouter.post("/", requireAuth, createNotice);
noticeRouter.get("/", requireAuth, getNotices);
noticeRouter.patch("/:noticeId", requireAuth, updateNotice);
noticeRouter.delete("/:noticeId", requireAuth, deleteNotice);

export default noticeRouter;