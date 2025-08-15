import cron from "node-cron";
import path from "path";
import { promises as fsPromises } from "fs";
import Message from "../models/messageModel.js";
import { io } from "../app.js";

// Run every 5 minutes
const messageCleanupJob = cron.schedule("*/5 * * * *", async () => {
  try {
    const now = new Date();

    // Find messages scheduled for deletion, including necessary fields
    const messagesToDelete = await Message.find(
      { scheduledDeletionTime: { $lte: now } },
      { media: 1, conversation: 1, sender: 1 } // Include conversation and sender
    );

    // Process each message
    for (const msg of messagesToDelete) {
      // Delete associated media files
      if (Array.isArray(msg.media) && msg.media.length > 0) {
        for (const mediaItem of msg.media) {
          if (mediaItem.url) {
            const correctedPath = mediaItem.url.includes("uploads")
              ? mediaItem.url
              : path.join("uploads", mediaItem.url);

            const filePath = path.join(process.cwd(), correctedPath);

            // Non-blocking delete
            await fsPromises.unlink(filePath).catch((err) => {
              console.error(`[Cron] Failed to delete file ${filePath}:`, err);
            });
          }
        }
      }

      // Emit messageDeleted event with hardDelete: true
      io.to(msg.conversation.toString()).emit("messageDeleted", {
        messageId: msg._id.toString(),
        userId: msg.sender.toString(), // Use the original sender as the userId
        hardDelete: true,
      });
    }

    // Delete messages from DB
    const result = await Message.deleteMany({
      scheduledDeletionTime: { $lte: now },
    });

    console.log(
      `[Cron] Deleted ${result.deletedCount} expired messages and their media at ${now.toISOString()}`
    );
  } catch (error) {
    console.error("[Cron] Message cleanup failed:", error);
  }
});

export default messageCleanupJob;
