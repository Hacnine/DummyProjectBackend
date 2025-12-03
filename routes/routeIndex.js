import { Router } from "express";
// Routes
import userRouter from "./userRoute.js";
import conversationRouter from "./conversationRoute.js";
import messageRouter from "./messageRoute.js";
import quickMessageRouter from "./quickMessageRoute.js";
import quickLessonRouter from "./quickLessonRoute.js";
import adminRouter from "./adminRoutes.js";
import adminUserRouter from "./adminUserRoutes.js";
import classRoutes from "./classRoutes.js";
import assignmentRoutes from "./assignmentRoutes.js";
import attendanceRoutes from "./attendanceRoutes.js";
import alertnessRoutes from "./alertnessRoutes.js";
import notificationRoutes from "./notificationRoutes.js";
import fileRoutes from "./fileRoutes.js";
import socialRoutes from "./socialRoutes.js";
import noticeRouter from "./noticeRoutes.js";
import siteSecurityRouter from "./siteSecurityRoutes.js";
import conversationKeyRouter from "./conversationKeyRoutes.js";
import reportRouter from "./reportRoutes.js";
import permissionRouter from "./permissionRoutes.js";

const apiRoute = Router();

apiRoute.use("/user", userRouter);
apiRoute.use("/conversations", conversationRouter);
apiRoute.use("/messages", messageRouter);
apiRoute.use("/quick-messages", quickMessageRouter);
apiRoute.use("/quick-lessons",  quickLessonRouter);
apiRoute.use("/admin",  adminRouter);
apiRoute.use("/admin/user-management", adminUserRouter);
apiRoute.use("/notices", noticeRouter);
apiRoute.use("/class-group/classes", classRoutes);
apiRoute.use("/class-group/assignments", assignmentRoutes);
apiRoute.use("/class-group/attendance", attendanceRoutes);
apiRoute.use("/class-group/alertness", alertnessRoutes);
apiRoute.use("/class-group/notification", notificationRoutes);
apiRoute.use("/class-group/files",  fileRoutes);
apiRoute.use("/social", socialRoutes);
apiRoute.use("/site-security", siteSecurityRouter);
apiRoute.use("/conversations", conversationKeyRouter);
apiRoute.use("/reports", reportRouter);
apiRoute.use("/permissions", permissionRouter);

// Health check
apiRoute.get("/health", (req, res) => res.status(200).send("OK"));

// 404
apiRoute.use((req, res) =>
  res.status(404).json({ success: false, message: "Route not found" })
);

export default apiRoute;
