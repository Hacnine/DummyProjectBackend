
import cron from 'node-cron';
import Message from '../models/messageModel.js';

// Run every 5 minutes
const messageCleanupJob = cron.schedule('*/5 * * * *', async () => {
  try {
    const now = new Date();
    const result = await Message.deleteMany({
      scheduledDeletionTime: { $lte: now },
    });
    console.log(`[Cron] Deleted ${result.deletedCount} expired messages at ${now.toISOString()}`);
  } catch (error) {
    console.error('[Cron] Message cleanup failed:', error);
  }
});

export default messageCleanupJob;
