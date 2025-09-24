import Notice from "../models/noticeModel.js";
import { io } from "../app.js";
import User from "../models/userModel.js";

// Create a new notice
export const createNotice = async (req, res) => {
  try {
    const { title, content, targetAudience, eventType, eventDate, location } = req.body;
    const creator = req.user._id; // Assuming user is authenticated

    // Validate required fields
    if (!targetAudience || targetAudience.length === 0) {
      return res.status(400).json({ message: "targetAudience is required" });
    }

    const eventSpecificTypes = ["holiday", "exam", "meeting", "special"];
    if (eventSpecificTypes.includes(eventType) && !eventDate) {
      return res.status(400).json({ message: "eventDate is required for event-specific notices" });
    }

    // Get recipients based on targetAudience
    let recipients = [];
    if (targetAudience.includes("all")) {
      recipients = await User.find().select("_id");
    } else {
      recipients = await User.find({ role: { $in: targetAudience } }).select("_id");
    }

    const notice = new Notice({
      title,
      content,
      targetAudience,
      eventType,
      creator,
      recipients: recipients.map((user) => user._id),
      eventDate,
      location,
    });

    await notice.save();

    // Emit real-time event
    io.emit("newNotice", {
      noticeId: notice._id,
      title,
      targetAudience,
      eventType,
      eventDate,
      location,
      createdAt: notice.createdAt,
    });

    res.status(201).json({ message: "Notice created successfully", notice });
  } catch (error) {
    res.status(500).json({ message: "Error creating notice", error: error.message });
  }
};

// Get all notices for a user
export const getNotices = async (req, res) => {
  try {
    const userId = req.user._id;
    const user = await User.findById(userId).select("role");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Fetch notices where targetAudience includes "all" or the user's role
    const query = {
      $or: [
        { targetAudience: "all" },
        { targetAudience: user.role },
      ],
      isActive: true,
    };

    const notices = await Notice.find(query)
      .populate("creator", "name")
      .sort({ createdAt: -1 });

    res.status(200).json(notices);
  } catch (error) {
    res.status(500).json({ message: "Error fetching notices", error: error.message });
  }
};

export const updateNotice = async (req, res) => {
  try {
    const { noticeId } = req.params;
    const { title, content, targetAudience, eventType, eventDate, location } = req.body;
    const userId = req.user._id;console.log("userId", userId)

    const notice = await Notice.findById(noticeId);
    if (!notice) {
      return res.status(404).json({ message: "Notice not found" });
    }

    if (notice.creator.toString() !== userId.toString()) {
      return res.status(403).json({ message: "Not authorized to update this notice" });
    }

    // Validate required fields if updating
    const updatedEventType = eventType || notice.eventType;
    const eventSpecificTypes = ["general", "holiday", "exam", "meeting", "special", "announcement"];
    if (eventSpecificTypes.includes(updatedEventType) && !eventDate && !notice.eventDate) {
      return res
        .status(400)
        .json({ message: "eventDate is required for event-specific notices" });
    }

    // Update recipients if targetAudience changes
    let recipients = notice.recipients;
    if (targetAudience) {
      if (targetAudience === "all") {
        recipients = await User.find().select("_id");
      } else {
        recipients = await User.find({ role: targetAudience }).select("_id");
      }
      recipients = recipients.map((user) => user._id);
    }

    // Update fields
    notice.title = title || notice.title;
    notice.content = content || notice.content;
    notice.targetAudience = targetAudience || notice.targetAudience;
    notice.eventType = eventType || notice.eventType;
    notice.recipients = recipients;
    notice.eventDate = eventDate || notice.eventDate;
    notice.location = location || notice.location;

    await notice.save();

    // Emit update event
    io.emit("updateNotice", {
      noticeId: notice._id,
      title: notice.title,
      targetAudience: notice.targetAudience,
      eventType: notice.eventType,
      eventDate: notice.eventDate,
      location: notice.location,
      updatedAt: notice.updatedAt,
    });

    res.status(200).json({ message: "Notice updated successfully", notice });
  } catch (error) {
    res.status(500).json({ message: "Error updating notice", error: error.message });
  }
};

// Delete a notice
export const deleteNotice = async (req, res) => {
  try {
    const { noticeId } = req.params;
    const userId = req.user._id;

    const notice = await Notice.findById(noticeId);
    if (!notice) {
      return res.status(404).json({ message: "Notice not found" });
    }

    if (notice.creator.toString() !== userId.toString()) {
      return res.status(403).json({ message: "Not authorized to delete this notice" });
    }

    notice.isActive = false;
    await notice.save();

    // Emit delete event
    io.emit("deleteNotice", { noticeId });

    res.status(200).json({ message: "Notice deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Error deleting notice", error: error.message });
  }
};