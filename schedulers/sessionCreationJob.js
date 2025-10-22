import cron from "node-cron";
import Session from "../models/sessionModel.js";
import AttendanceLog from "../models/attendanceLogModel.js";
import Conversation from "../models/conversationModel.js";
import moment from "moment";

export function scheduleSessionCronForClass(classGroup) {
  const startTime = classGroup.group.startTime || "09:00";
  const [hour, minute] = startTime.split(":").map(Number);
  const cutoffTime = classGroup.group.cutoffTime || "09:15";

  cron.schedule(`${minute} ${hour} * * *`, async () => {
    try {
      const today = moment().format("YYYY-MM-DD");
      const todayDay = moment().day();

      // Check if a session already exists for today
      const existingSession = await Session.findOne({
        classId: classGroup._id,
        date: today,
      });
      if (existingSession) {
        console.log(`Session already exists for class ${classGroup._id} on ${today}`);
        return;
      }

      // Use group.classType, default to "regular" if undefined
      const classType = classGroup.group.classType || "regular";
      if (!["regular", "weekly", "multi-weekly", "monthly", "exam"].includes(classType)) {
        console.warn(`Invalid classType '${classType}' for class ${classGroup._id}. Defaulting to 'regular'`);
      }

      let shouldCreateSession = false;
      if (classType === "regular") {
        shouldCreateSession = true;
      } else if (classType === "multi-weekly") {
        const selectedDays = classGroup.group.selectedDays || [];
        if (selectedDays.includes(todayDay)) {
          shouldCreateSession = true;
        }
      }

      if (shouldCreateSession) {
        const session = new Session({
          classId: classGroup._id,
          date: today,
          startTime: startTime,
          cutoffTime: cutoffTime,
        });
        await session.save();
        console.log(`Session created for class ${classGroup._id} on ${today}`);
      } else {
        console.log(`No session created for class ${classGroup._id} on ${today} (classType: ${classType}, todayDay: ${todayDay})`);
      }
    } catch (error) {
      console.error(`Error generating session for class ${classGroup._id}:`, error);
    }
  }, { timezone: "Asia/Dhaka" });
}

export const startCronJobs = async () => {
  try {
    // Fetch all classrooms to reschedule cron jobs
    const classes = await Conversation.find({ "group.type": "classroom" });
    // console.log(`Found ${classes.length} classes to schedule cron jobs`);

    // Create sessions for today if missed (e.g., server was down at startTime)
    for (const classGroup of classes) {
      const today = moment().format("YYYY-MM-DD");
      const todayDay = moment().day();
      const startTime = classGroup.group.startTime || "09:00";
      const cutoffTime = classGroup.group.cutoffTime || "09:15";
      const now = moment();
      const start = moment(`${today} ${startTime}`, "YYYY-MM-DD HH:mm");

      if (now.isAfter(start)) {
        const existingSession = await Session.findOne({ classId: classGroup._id, date: today });
        if (!existingSession) {
          const classType = classGroup.group.classType || "regular";
          if (!["regular", "weekly", "multi-weekly", "monthly", "exam"].includes(classType)) {
            console.warn(`Invalid classType '${classType}' for class ${classGroup._id}. Defaulting to 'regular'`);
          }

          let shouldCreateSession = false;
          if (classType === "regular") {
            shouldCreateSession = true;
          } else if (classType === "multi-weekly" && classGroup.group.selectedDays.includes(todayDay)) {
            shouldCreateSession = true;
          }
          if (shouldCreateSession) {
            const session = new Session({
              classId: classGroup._id,
              date: today,
              startTime,
              cutoffTime,
            });
            await session.save();
            console.log(`Created missed session for class ${classGroup._id} on ${today}`);
          }
        }
      }
    }

    // Schedule cron jobs for all classes
    classes.forEach((classGroup) => {
      if (classGroup.group.type === "classroom") {
        scheduleSessionCronForClass(classGroup);
        // console.log(`Cron job scheduled for class ${classGroup._id} (${classGroup.group.name})`);
      } else {
        console.log(`Skipping cron job for non-classroom group ${classGroup._id} (${classGroup.group.name})`);
      }
    });

    // Schedule absent marking based on a dynamic check interval
    const checkInterval = 15; // Default to 15 minutes
    cron.schedule(`*/${checkInterval} * * * *`, async () => {
      try {
        const now = moment();
        const sessions = await Session.find({
          status: "scheduled",
          date: now.format("YYYY-MM-DD"),
        });

        for (const session of sessions) {
          const classGroup = await Conversation.findById(session.classId);
          if (!classGroup || !classGroup.group || classGroup.group.type !== "classroom" || !Array.isArray(classGroup.participants)) {
            console.error(`Invalid classGroup or participants for session ${session._id}. ClassId: ${session.classId}`);
            continue; // Skip to the next session
          }

          const startTime = classGroup.group.startTime || "09:00";
          const cutoffTime = classGroup.group.cutoffTime || "09:15";
          const start = moment(`${session.date} ${startTime}`, "YYYY-MM-DD HH:mm");
          const cutoff = moment(`${session.date} ${cutoffTime}`, "YYYY-MM-DD HH:mm");

          if (now.isAfter(cutoff)) {
            const participants = classGroup.participants; // Use participants instead of members
            const existingLogs = await AttendanceLog.find({ sessionId: session._id }).select("userId enteredAt status");
            const attendedUsers = existingLogs.map(log => ({
              userId: log.userId.toString(),
              enteredAt: log.enteredAt,
              status: log.status,
            }));
            const absentUsers = participants.filter(participant => {
              const log = attendedUsers.find(u => u.userId === participant.toString());
              return !log || (log && now.isAfter(cutoff));
            });

            const bulkOps = absentUsers.map(userId => ({
              insertOne: {
                document: {
                  sessionId: session._id,
                  classId: session.classId,
                  userId,
                  sessionDate: session.date,
                  status: "absent",
                },
              },
            }));

            if (bulkOps.length > 0) {
              await AttendanceLog.bulkWrite(bulkOps);
              console.log(`Marked ${bulkOps.length} absent students for session ${session._id}`);
            }

            session.status = "completed";
            await session.save();
            console.log(`Session ${session._id} marked as completed`);
          } else if (now.isAfter(start) && now.isBefore(cutoff)) {
            const existingLogs = await AttendanceLog.find({
              sessionId: session._id,
              enteredAt: { $exists: true },
            }).select("userId enteredAt status");
            for (const log of existingLogs) {
              const entered = moment(log.enteredAt);
              if (entered.isAfter(start) && entered.isBefore(cutoff) && log.status !== "late") {
                log.status = "late";
                await log.save();
                console.log(`Marked user ${log.userId} as late for session ${session._id}`);
              }
            }
          }
        }
      } catch (error) {
        console.error("Error in absent marking cron job:", error);
      }
    }, { timezone: "Asia/Dhaka" });

    console.log("Cron jobs started successfully");
  } catch (error) {
    console.error("Error initializing cron jobs:", error);
  }
};