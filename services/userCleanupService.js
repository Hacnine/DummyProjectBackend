import User from "../models/userModel.js"
import UserDeletionSchedule from "../models/userDeletionScheduleModel.js"
import AdminActivityLog from "../models/adminActivityLogModel.js"
import cron from "node-cron"

// Check for inactive users and schedule them for deletion
export const scheduleInactiveUsersForDeletion = async () => {
  try {
    console.log("Running inactive user cleanup check...")

    const sevenMonthsAgo = new Date()
    sevenMonthsAgo.setMonth(sevenMonthsAgo.getMonth() - 7)

    // Find users inactive for 7+ months
    const inactiveUsers = await User.find({
      $or: [{ last_seen: { $lt: sevenMonthsAgo } }, { last_seen: null, createdAt: { $lt: sevenMonthsAgo } }],
      is_active: true,
      role: { $ne: "superadmin" }, // Don't delete super admins
    })

    console.log(`Found ${inactiveUsers.length} inactive users`)

    for (const user of inactiveUsers) {
      // Check if already scheduled
      const existingSchedule = await UserDeletionSchedule.findOne({
        user: user._id,
        status: { $in: ["scheduled", "prevented"] },
      })

      if (!existingSchedule) {
        // Schedule for deletion in 30 days
        const scheduledFor = new Date()
        scheduledFor.setDate(scheduledFor.getDate() + 30)

        await UserDeletionSchedule.create({
          user: user._id,
          scheduled_for: scheduledFor,
          reason: "Inactive for 7+ months",
          last_activity: user.last_seen || user.createdAt,
        })

        console.log(`Scheduled user ${user.email} for deletion`)

        // Log activity
        await AdminActivityLog.create({
          admin: null, // System action
          action: "schedule_deletion",
          target_type: "user",
          target_id: user._id,
          details: {
            reason: "Inactive for 7+ months",
            scheduled_for: scheduledFor,
            last_activity: user.last_seen || user.createdAt,
            severity: "medium",
          },
        })
      }
    }
  } catch (error) {
    console.error("Error in inactive user cleanup:", error)
  }
}

// Execute scheduled deletions
export const executeScheduledDeletions = async () => {
  try {
    console.log("Checking for users to delete...")

    const now = new Date()
    const schedulesToExecute = await UserDeletionSchedule.find({
      status: "scheduled",
      scheduled_for: { $lte: now },
    }).populate("user")

    console.log(`Found ${schedulesToExecute.length} users scheduled for deletion`)

    for (const schedule of schedulesToExecute) {
      if (schedule.user) {
        // Delete the user
        await User.findByIdAndDelete(schedule.user._id)

        // Update schedule status
        schedule.status = "deleted"
        await schedule.save()

        console.log(`Deleted user: ${schedule.user.email}`)

        // Log activity
        await AdminActivityLog.create({
          admin: null, // System action
          action: "auto_delete_user",
          target_type: "user",
          target_id: schedule.user._id,
          details: {
            user_email: schedule.user.email,
            reason: schedule.reason,
            severity: "high",
          },
        })
      }
    }
  } catch (error) {
    console.error("Error executing scheduled deletions:", error)
  }
}

// Send warnings to users scheduled for deletion
export const sendDeletionWarnings = async () => {
  try {
    const threeDaysFromNow = new Date()
    threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3)

    // Find users scheduled for deletion in 3 days who haven't received final warning
    const schedules = await UserDeletionSchedule.find({
      status: "scheduled",
      scheduled_for: { $lte: threeDaysFromNow },
      final_warning_sent: false,
    }).populate("user")

    for (const schedule of schedules) {
      if (schedule.user) {
        // Here you would send email/notification to user
        console.log(`Sending final warning to ${schedule.user.email}`)

        // Mark warning as sent
        schedule.final_warning_sent = true
        await schedule.save()

        // You can emit socket event to notify user if they're online
        // io.to(schedule.user._id.toString()).emit("deletionWarning", {
        //   message: "Your account will be deleted in 3 days due to inactivity",
        //   scheduled_for: schedule.scheduled_for
        // })
      }
    }
  } catch (error) {
    console.error("Error sending deletion warnings:", error)
  }
}

// Initialize cleanup service with cron jobs
export const initializeCleanupService = () => {
  // Run daily at 2 AM to check for inactive users
  cron.schedule("0 2 * * *", scheduleInactiveUsersForDeletion)

  // Run daily at 3 AM to execute scheduled deletions
  cron.schedule("0 3 * * *", executeScheduledDeletions)

  // Run daily at 1 PM to send warnings
  cron.schedule("0 13 * * *", sendDeletionWarnings)

  console.log("User cleanup service initialized with cron jobs")
}
