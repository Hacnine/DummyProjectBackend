import cron from "node-cron";
import path from "path";
import { promises as fsPromises } from "fs";
import Message from "../models/messageModel.js";

// Run every 5 minutes
const messageCleanupJob = cron.schedule("*/5 * * * *", async () => {
  try {
    const now = new Date();

    //  Find messages scheduled for deletion
    const messagesToDelete = await Message.find(
      { scheduledDeletionTime: { $lte: now } },
      { media: 1 } // only get media field for cleanup
    );

    //  Delete associated media files
    for (const msg of messagesToDelete) {
      if (Array.isArray(msg.media) && msg.media.length > 0) {
        for (const mediaItem of msg.media) {
          if (mediaItem.url) {
            const correctedPath = mediaItem.url.includes("uploads")
              ? mediaItem.url
              : path.join("uploads", mediaItem.url);

            const filePath = path.join(process.cwd(), correctedPath);

            // Non-blocking delete
            fsPromises.unlink(filePath).catch((err) => {
              console.error(`[Cron] Failed to delete file ${filePath}:`, err);
            });
          }
        }
      }
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

