import express from "express";
import {
  getQuickMessages,
  addQuickMessage,
  editQuickMessage,
  deleteQuickMessage,
} from "../controllers/quickMessageController.js";
import { isLogin } from "../middlewares/auth.middleware.js";

const router = express.Router();

router.use(isLogin);

router.get("/", getQuickMessages);
router.post("/", addQuickMessage);
router.put("/:id", editQuickMessage);
router.delete("/:id", deleteQuickMessage);

export default router;