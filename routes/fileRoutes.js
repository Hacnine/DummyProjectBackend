import express from "express"
import multer from "multer"
import { requireAuth } from "../middlewares/roleMiddleware.js"
import {
  uploadFile,
  downloadFile,
  deleteFile,
  getFileInfo,
  getUserFiles,
  getClassFiles,
} from "../controllers/fileController.js"

const router = express.Router()

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/")
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9)
    cb(null, file.fieldname + "-" + uniqueSuffix + "." + file.originalname.split(".").pop())
  },
})

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Allow specific file types
    const allowedTypes = /jpeg|jpg|png|gif|pdf|doc|docx|txt|zip|rar/
    const extname = allowedTypes.test(file.originalname.toLowerCase())
    const mimetype = allowedTypes.test(file.mimetype)

    if (mimetype && extname) {
      return cb(null, true)
    } else {
      cb(new Error("Invalid file type"))
    }
  },
})

// All routes require authentication
router.use(requireAuth)

// File upload and management
router.post("/upload", upload.single("file"), uploadFile)
router.get("/download/:fileId", downloadFile)
router.delete("/:fileId", deleteFile)
router.get("/:fileId/info", getFileInfo)

// Get files
router.get("/user/files", getUserFiles)
router.get("/class/:classId/files", getClassFiles)

export default router
