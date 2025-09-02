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

// Static method to calculate daily streak
dailyTaskSchema.statics.calculateDailyStreak = async function (userId) {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  // Get all active tasks for the user
  const activeTasks = await this.find({
    userId: userId,
    isActive: true,
    dateStarted: { $lte: today },
    dateEnded: { $gte: yesterday },
  });

  if (activeTasks.length === 0) {
    return { currentStreak: 0, longestStreak: 0 };
  }

  // Check if any task has lastCompletedDate less than yesterday
  const hasIncompleteYesterday = activeTasks.some((task) => {
    if (!task.lastCompletedDate) return true;

    const lastCompleted = new Date(task.lastCompletedDate);
    lastCompleted.setHours(0, 0, 0, 0);
    yesterday.setHours(0, 0, 0, 0);

    return lastCompleted < yesterday;
  });

  if (hasIncompleteYesterday) {
    return { currentStreak: 0, longestStreak: 0 };
  }

  // Calculate current streak
  let currentStreak = 0;
  const checkDate = new Date(today);

  while (true) {
    checkDate.setDate(checkDate.getDate() - 1);

    // Get tasks that were active on this date
    const tasksForDate = activeTasks.filter((task) => {
      const taskStart = new Date(task.dateStarted);
      const taskEnd = new Date(task.dateEnded);
      taskStart.setHours(0, 0, 0, 0);
      taskEnd.setHours(0, 0, 0, 0);
      checkDate.setHours(0, 0, 0, 0);

      return taskStart <= checkDate && taskEnd >= checkDate;
    });

    if (tasksForDate.length === 0) break;

    // Check if all tasks for this date were completed
    const allCompleted = tasksForDate.every((task) => {
      if (!task.lastCompletedDate) return false;

      const lastCompleted = new Date(task.lastCompletedDate);
      lastCompleted.setHours(0, 0, 0, 0);

      return lastCompleted >= checkDate;
    });

    if (allCompleted) {
      currentStreak++;
    } else {
      break;
    }
  }

  // For now, longest streak equals current streak
  // In a more complex implementation, you could track this separately
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
