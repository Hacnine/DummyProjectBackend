import cron from "node-cron";
import User from "../models/userModel.js";
import UserDeletionSchedule from "../models/userDeletionScheduleModel.js";

// Automatically schedule users for deletion based on inactivity
const scheduleInactiveUsersForDeletion = async () => {
  try {
    // Define inactivity threshold (e.g., 7 months)
    const INACTIVITY_THRESHOLD = 7 * 30 * 24 * 60 * 60 * 1000; // 7 months in milliseconds
    const cutoffDate = new Date(Date.now() - INACTIVITY_THRESHOLD);

    // Find users who haven't logged in since the cutoff date or never logged in and created before cutoff
    const inactiveUsers = await User.find({
      $or: [
        { last_seen: { $lt: cutoffDate } },
        { $and: [{ last_seen: null }, { createdAt: { $lt: cutoffDate } }] }, // Only include if createdAt is old enough
      ],
      _id: {
        $nin: await UserDeletionSchedule.find({ status: "scheduled" }).distinct("user"),
      },
    });

    // Schedule deletion for each inactive user
    const deletionSchedules = inactiveUsers.map(async (user) => {
      const scheduledDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // Schedule deletion 30 days from now
      const schedule = await UserDeletionSchedule.create({
        user: user._id,
        scheduled_for: scheduledDate,
        reason: "Inactive for 7+ months",
        status: "scheduled",
        last_activity: user.last_seen || user.createdAt,
      });
      console.log(`User scheduled for deletion: Name: ${user.name}, Email: ${user.email}, Scheduled Date: ${scheduledDate}`);
      return schedule;
    });

    await Promise.all(deletionSchedules);

    console.log(`Total: Scheduled ${inactiveUsers.length} users for deletion.`);
    return { message: `Successfully scheduled ${inactiveUsers.length} users for deletion.` };
  } catch (error) {
    console.error("Failed to schedule deletions:", error);
    throw new Error(`Failed to schedule deletions: ${error.message}`);
  }
};

// Execute scheduled deletions
const executeScheduledDeletions = async () => {
  try {
    const currentDate = new Date();
    // Find schedules due for deletion
    const dueSchedules = await UserDeletionSchedule.find({
      status: "scheduled",
      scheduled_for: { $lte: currentDate },
    }).populate("user", "name email");

    // Delete users and update schedules
    const deletionPromises = dueSchedules.map(async (schedule) => {
      if (schedule.user) {
        await User.deleteOne({ _id: schedule.user._id });
        schedule.status = "deleted";
        schedule.deleted_at = new Date();
        await schedule.save();
        console.log(`User deleted: Name: ${schedule.user.name}, Email: ${schedule.user.email}, Deleted At: ${schedule.deleted_at}`);
      } else {
        // Handle case where user no longer exists
        schedule.status = "cancelled";
        schedule.cancelled_at = new Date();
        schedule.cancellation_reason = "User not found";
        await schedule.save();
        console.log(`Schedule cancelled (user not found): ID: ${schedule.user}, Scheduled For: ${schedule.scheduled_for}`);
      }
    });

    await Promise.all(deletionPromises);

    console.log(`Total: Processed ${dueSchedules.length} scheduled deletions.`);
    return { message: `Successfully processed ${dueSchedules.length} scheduled deletions.` };
  } catch (error) {
    console.error("Failed to execute deletions:", error);
    throw new Error(`Failed to execute deletions: ${error.message}`);
  }
};

// Start cron jobs
export const startCronJobsForScheduledDeletion = () => {
  // Schedule user deletion scheduling at 6:44 AM daily
  cron.schedule("44 6 * * *", async () => {
    console.log("Running automatic deletion scheduling...");
    try {
      await scheduleInactiveUsersForDeletion();
      console.log("Automatic deletion scheduling completed.");
    } catch (error) {
      console.error("Automatic deletion scheduling failed:", error);
    }
  });

  // Execute scheduled deletions at 7:00 AM daily
  cron.schedule("0 7 * * *", async () => {
    console.log("Running scheduled deletion execution...");
    try {
      await executeScheduledDeletions();
      console.log("Scheduled deletion execution completed.");
    } catch (error) {
      console.error("Scheduled deletion execution failed:", error);
    }
  });

  console.log("Cron jobs started successfully.");
};