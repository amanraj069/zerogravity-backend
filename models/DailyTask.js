const mongoose = require("mongoose");

// Daily Task schema
const dailyTaskSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: [true, "User ID is required"],
      ref: "User",
    },
    title: {
      type: String,
      required: [true, "Task title is required"],
      trim: true,
      maxlength: [200, "Task title cannot exceed 200 characters"],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [1000, "Task description cannot exceed 1000 characters"],
    },
    priority: {
      type: String,
      required: [true, "Task priority is required"],
      enum: {
        values: ["low", "medium", "high"],
        message: "Priority must be one of: low, medium, high",
      },
      default: "medium",
    },
    dateStarted: {
      type: Date,
      required: [true, "Start date is required"],
    },
    dateEnded: {
      type: Date,
      required: [true, "End date is required"],
    },
    dailyStartTime: {
      type: String,
      required: [true, "Daily start time is required"],
      match: [
        /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/,
        "Please enter a valid time format (HH:MM)",
      ],
    },
    dailyEndTime: {
      type: String,
      required: [true, "Daily end time is required"],
      match: [
        /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/,
        "Please enter a valid time format (HH:MM)",
      ],
    },
    lastCompletedDate: {
      type: Date,
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for better query performance
dailyTaskSchema.index({ userId: 1, createdAt: -1 });
dailyTaskSchema.index({ userId: 1, dateStarted: 1, dateEnded: 1 });
dailyTaskSchema.index({ userId: 1, isActive: 1 });

// Validation to ensure start date is not after end date
dailyTaskSchema.pre("save", function (next) {
  if (this.dateStarted >= this.dateEnded) {
    next(new Error("Start date must be before end date"));
  }

  // Parse times to ensure start time is before end time
  const [startHour, startMin] = this.dailyStartTime.split(":").map(Number);
  const [endHour, endMin] = this.dailyEndTime.split(":").map(Number);

  const startTotalMinutes = startHour * 60 + startMin;
  const endTotalMinutes = endHour * 60 + endMin;

  if (startTotalMinutes >= endTotalMinutes) {
    next(new Error("Daily start time must be before daily end time"));
  }

  next();
});

// Static method to get active tasks for a user
dailyTaskSchema.statics.getActiveTasks = async function (userId, date = null) {
  const queryDate = date ? new Date(date) : new Date();

  return this.find({
    userId: userId,
    isActive: true,
    dateStarted: { $lte: queryDate },
    dateEnded: { $gte: queryDate },
  }).sort({ createdAt: -1 });
};

// Static method to calculate daily streak based on per-day completions
dailyTaskSchema.statics.calculateDailyStreak = async function (userId) {
  const DailyStats = require("./DailyStats");

  const toDayStartUTC = (date) => {
    const d = new Date(date);
    d.setUTCHours(0, 0, 0, 0);
    return d;
  };

  const getActiveTasksForDate = async (date) => {
    return this.find({
      userId: userId,
      isActive: true,
      dateStarted: { $lte: date },
      dateEnded: { $gte: date },
    }).select({ _id: 1 });
  };

  const isDayFullyComplete = async (date) => {
    const day = toDayStartUTC(date);
    const tasks = await getActiveTasksForDate(day);
    if (tasks.length === 0) return false;

    const taskIds = tasks.map((t) => t._id);
    const completions = await DailyStats.find({
      userId: userId,
      taskId: { $in: taskIds },
      completedDate: day,
    }).select({ _id: 1, taskId: 1 });

    return completions.length === taskIds.length;
  };

  const today = toDayStartUTC(new Date());

  // Walk backward to find the most recent fully completed day, then count consecutive days
  let currentStreak = 0;
  let cursor = new Date(today);
  const MAX_DAYS_TO_SCAN = 365; // safety bound
  let anchored = false;

  for (let i = 0; i < MAX_DAYS_TO_SCAN; i++) {
    const dayStart = toDayStartUTC(cursor);
    const tasks = await getActiveTasksForDate(dayStart);

    // If no tasks on this day: if not anchored, keep scanning back; if anchored, we stop
    if (tasks.length === 0) {
      if (anchored) break;
      cursor.setDate(cursor.getDate() - 1);
      continue;
    }

    const taskIds = tasks.map((t) => t._id);
    const completions = await DailyStats.find({
      userId: userId,
      taskId: { $in: taskIds },
      completedDate: dayStart,
    }).select({ _id: 1, taskId: 1 });

    if (completions.length === taskIds.length) {
      // This day is fully complete; start or continue the streak
      anchored = true;
      currentStreak += 1;
      cursor.setDate(cursor.getDate() - 1);
      continue;
    }

    // Day is not fully complete
    if (!anchored) {
      // Haven't found the anchor yet; keep scanning back to locate the most recent fully complete day
      cursor.setDate(cursor.getDate() - 1);
      continue;
    }

    // We already anchored and hit an incomplete day; streak ends
    break;
  }

  return {
    currentStreak: currentStreak,
    longestStreak: Math.max(currentStreak, 0),
  };
};

// Static method to recalculate lastCompletedDate for a task
dailyTaskSchema.statics.recalculateLastCompletedDate = async function (
  taskId,
  userId
) {
  const DailyStats = require("./DailyStats");

  // Find the most recent completion for this task
  const mostRecentCompletion = await DailyStats.findOne({
    userId: userId,
    taskId: taskId,
  }).sort({ completedDate: -1 });

  // Update the task's lastCompletedDate
  const lastCompletedDate = mostRecentCompletion
    ? mostRecentCompletion.completedDate
    : null;

  await this.findByIdAndUpdate(taskId, {
    lastCompletedDate: lastCompletedDate,
  });

  return lastCompletedDate;
};

module.exports = mongoose.model("DailyTask", dailyTaskSchema);
