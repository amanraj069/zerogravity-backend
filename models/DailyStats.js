const mongoose = require("mongoose");

// Daily Stats schema - tracks daily completion of tasks
const dailyStatsSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: [true, "User ID is required"],
      ref: "User",
    },
    taskId: {
      type: mongoose.Schema.Types.ObjectId,
      required: [true, "Task ID is required"],
      ref: "DailyTask",
    },
    completedDate: {
      type: Date,
      required: [true, "Completion date is required"],
    },
    completedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for better query performance
dailyStatsSchema.index({ userId: 1, completedDate: -1 });
dailyStatsSchema.index({ taskId: 1, completedDate: -1 });
dailyStatsSchema.index(
  { userId: 1, taskId: 1, completedDate: 1 },
  { unique: true }
);

// Static method to mark task as completed for a specific date
dailyStatsSchema.statics.markTaskCompleted = async function (
  userId,
  taskId,
  date = null
) {
  const completionDate = date ? new Date(date) : new Date();
  completionDate.setUTCHours(0, 0, 0, 0); // Normalize to UTC start of day

  try {
    const result = await this.findOneAndUpdate(
      {
        userId: userId,
        taskId: taskId,
        completedDate: completionDate,
      },
      {
        userId: userId,
        taskId: taskId,
        completedDate: completionDate,
        completedAt: new Date(),
      },
      {
        upsert: true,
        new: true,
      }
    );

    return result;
  } catch (error) {
    if (error.code === 11000) {
      // Task already completed for this date
      return await this.findOne({
        userId: userId,
        taskId: taskId,
        completedDate: completionDate,
      });
    }
    throw error;
  }
};

// Static method to unmark task completion
dailyStatsSchema.statics.unmarkTaskCompleted = async function (
  userId,
  taskId,
  date = null
) {
  const completionDate = date ? new Date(date) : new Date();
  completionDate.setUTCHours(0, 0, 0, 0); // Normalize to UTC start of day

  return await this.findOneAndDelete({
    userId: userId,
    taskId: taskId,
    completedDate: completionDate,
  });
};

// Static method to check if task is completed for a specific date
dailyStatsSchema.statics.isTaskCompleted = async function (
  userId,
  taskId,
  date = null
) {
  const checkDate = date ? new Date(date) : new Date();
  checkDate.setUTCHours(0, 0, 0, 0); // Normalize to UTC start of day

  const completion = await this.findOne({
    userId: userId,
    taskId: taskId,
    completedDate: checkDate,
  });

  return !!completion;
};

// Static method to get completion stats for a user
dailyStatsSchema.statics.getUserStats = async function (
  userId,
  startDate = null,
  endDate = null
) {
  const match = { userId: userId };

  if (startDate) {
    match.completedDate = match.completedDate || {};
    const s = new Date(startDate);
    s.setUTCHours(0, 0, 0, 0);
    match.completedDate.$gte = s;
  }

  if (endDate) {
    match.completedDate = match.completedDate || {};
    const e = new Date(endDate);
    e.setUTCHours(23, 59, 59, 999);
    match.completedDate.$lte = e;
  }

  return await this.find(match).sort({ completedDate: -1 });
};

module.exports = mongoose.model("DailyStats", dailyStatsSchema);
