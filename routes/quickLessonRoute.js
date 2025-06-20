import express from "express";
import {
  getQuickLessons,
  addQuickLesson,
  editQuickLesson,
  deleteQuickLesson,
} from "../controllers/quickLessonController.js";
import { isLogin } from "../middlewares/auth.middleware.js";

const router = express.Router();

router.use(isLogin);

router.get("/", getQuickLessons);
router.post("/", addQuickLesson);
router.put("/:id", editQuickLesson);
router.delete("/:id", deleteQuickLesson);

export default router;