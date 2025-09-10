import fs from "fs"
import File from "../models/fileModel.js"
import Conversation from "../models/conversationModel.js"

// Upload file
export const uploadFile = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" })
    }

    const { classId, description } = req.body
    const userId = req.user._id

    // If classId is provided, check if user has access
    if (classId) {
      const classGroup = await Conversation.findById(classId)
      if (!classGroup || !classGroup.participants.includes(userId)) {
        return res.status(403).json({ message: "Access denied" })
      }
    }

    const file = new File({
      filename: req.file.filename,
      originalName: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
      path: req.file.path,
      uploadedBy: userId,
      classId: classId || null,
      description: description || null,
    })

    await file.save()
    await file.populate("uploadedBy", "name email")

    res.json({
      message: "File uploaded successfully",
      file: {
        id: file._id,
        filename: file.filename,
        originalName: file.originalName,
        mimetype: file.mimetype,
        size: file.size,
        url: `/uploads/${file.filename}`,
        uploadedBy: file.uploadedBy,
        uploadedAt: file.createdAt,
      },
    })
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

// Download file
export const downloadFile = async (req, res) => {
  try {
    const { fileId } = req.params

    const file = await File.findById(fileId)
    if (!file) {
      return res.status(404).json({ message: "File not found" })
    }

    // Check if user has access to the file
    if (file.classId) {
      const classGroup = await Conversation.findById(file.classId)
      if (!classGroup || !classGroup.participants.includes(req.user._id)) {
        return res.status(403).json({ message: "Access denied" })
      }
    } else if (file.uploadedBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Access denied" })
    }

    // Check if file exists on disk
    if (!fs.existsSync(file.path)) {
      return res.status(404).json({ message: "File not found on server" })
    }

    // Set appropriate headers
    res.setHeader("Content-Disposition", `attachment; filename="${file.originalName}"`)
    res.setHeader("Content-Type", file.mimetype)

    // Stream the file
    const fileStream = fs.createReadStream(file.path)
    fileStream.pipe(res)
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

// Delete file
export const deleteFile = async (req, res) => {
  try {
    const { fileId } = req.params

    const file = await File.findById(fileId)
    if (!file) {
      return res.status(404).json({ message: "File not found" })
    }

    // Check if user has permission to delete
    const isOwner = file.uploadedBy.toString() === req.user._id.toString()
    let isAdmin = false

    if (file.classId) {
      const classGroup = await Conversation.findById(file.classId)
      isAdmin = classGroup?.group?.admins?.includes(req.user._id)
    }

    if (!isOwner && !isAdmin) {
      return res.status(403).json({ message: "Access denied" })
    }

    // Delete file from disk
    if (fs.existsSync(file.path)) {
      fs.unlinkSync(file.path)
    }

    // Delete file record from database
    await File.findByIdAndDelete(fileId)

    res.json({ message: "File deleted successfully" })
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

// Get file info
export const getFileInfo = async (req, res) => {
  try {
    const { fileId } = req.params

    const file = await File.findById(fileId).populate("uploadedBy", "name email")
    if (!file) {
      return res.status(404).json({ message: "File not found" })
    }

    // Check if user has access
    if (file.classId) {
      const classGroup = await Conversation.findById(file.classId)
      if (!classGroup || !classGroup.participants.includes(req.user._id)) {
        return res.status(403).json({ message: "Access denied" })
      }
    } else if (file.uploadedBy._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Access denied" })
    }

    res.json({
      file: {
        id: file._id,
        filename: file.filename,
        originalName: file.originalName,
        mimetype: file.mimetype,
        size: file.size,
        description: file.description,
        uploadedBy: file.uploadedBy,
        uploadedAt: file.createdAt,
        url: `/uploads/${file.filename}`,
      },
    })
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

// Get user files
export const getUserFiles = async (req, res) => {
  try {
    const userId = req.user._id
    const { page = 1, limit = 20 } = req.query

    const files = await File.find({ uploadedBy: userId })
      .populate("uploadedBy", "name email")
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ createdAt: -1 })

    const total = await File.countDocuments({ uploadedBy: userId })

    const filesWithUrls = files.map((file) => ({
      id: file._id,
      filename: file.filename,
      originalName: file.originalName,
      mimetype: file.mimetype,
      size: file.size,
      description: file.description,
      uploadedBy: file.uploadedBy,
      uploadedAt: file.createdAt,
      url: `/uploads/${file.filename}`,
    }))

    res.json({
      files: filesWithUrls,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total,
    })
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

// Get class files
export const getClassFiles = async (req, res) => {
  try {
    const { classId } = req.params
    const { page = 1, limit = 20 } = req.query

    // Check if user has access to class
    const classGroup = await Conversation.findById(classId)
    if (!classGroup || !classGroup.participants.includes(req.user._id)) {
      return res.status(403).json({ message: "Access denied" })
    }

    const files = await File.find({ classId })
      .populate("uploadedBy", "name email")
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ createdAt: -1 })

    const total = await File.countDocuments({ classId })

    const filesWithUrls = files.map((file) => ({
      id: file._id,
      filename: file.filename,
      originalName: file.originalName,
      mimetype: file.mimetype,
      size: file.size,
      description: file.description,
      uploadedBy: file.uploadedBy,
      uploadedAt: file.createdAt,
      url: `/uploads/${file.filename}`,
    }))

    res.json({
      files: filesWithUrls,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total,
    })
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message })
  }
}
