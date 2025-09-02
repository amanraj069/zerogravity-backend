const express = require("express");
const DailyTask = require("../models/DailyTask");
const DailyStats = require("../models/DailyStats");
const { authenticateToken } = require("../middleware/auth");

const router = express.Router();

// Get all daily tasks for a user with completion status for today
router.get("/", authenticateToken, async (req, res) => {
  try {
    const { date } = req.query;
    const queryDate = date ? new Date(date) : new Date();

    const tasks = await DailyTask.getActiveTasks(req.user.userId, queryDate);

    // Get completion status for each task for the specified date
    const tasksWithStatus = await Promise.all(
      tasks.map(async (task) => {
        const isCompleted = await DailyStats.isTaskCompleted(
          req.user.userId,
          task._id,
          queryDate
        );

        return {
          ...task.toObject(),
          isCompletedToday: isCompleted,
        };
      })
    );

    res.json({
      success: true,
      data: tasksWithStatus,
    });
  } catch (error) {
    console.error("Error fetching daily tasks:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching daily tasks",
      error: error.message,
    });
  }
});

// Get a specific daily task by ID
router.get("/:id", authenticateToken, async (req, res) => {
  try {
    const task = await DailyTask.findOne({
      _id: req.params.id,
      userId: req.user.userId,
    });

    if (!task) {
      return res.status(404).json({
        success: false,
        message: "Daily task not found",
      });
    }

    // Check if completed today
    const isCompletedToday = await DailyStats.isTaskCompleted(
      req.user.userId,
      task._id
    );

    res.json({
      success: true,
      data: {
        ...task.toObject(),
        isCompletedToday,
      },
    });
  } catch (error) {
    console.error("Error fetching daily task:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching daily task",
      error: error.message,
    });
  }
});

// Create a new daily task
router.post("/", authenticateToken, async (req, res) => {
  try {
    const {
      title,
      description,
      priority,
      dateStarted,
      dateEnded,
      dailyStartTime,
      dailyEndTime,
    } = req.body;

    // Validate required fields
    if (
      !title ||
      !dateStarted ||
      !dateEnded ||
      !dailyStartTime ||
      !dailyEndTime
    ) {
      return res.status(400).json({
        success: false,
        message: "Title, date range, and daily time range are required",
      });
    }

    const task = new DailyTask({
      userId: req.user.userId,
      title,
      description,
      priority: priority || "medium",
      dateStarted: new Date(dateStarted),
      dateEnded: new Date(dateEnded),
      dailyStartTime,
      dailyEndTime,
    });

    await task.save();

    res.status(201).json({
      success: true,
      data: task,
      message: "Daily task created successfully",
    });
  } catch (error) {
    console.error("Error creating daily task:", error);
    res.status(500).json({
      success: false,
      message: "Error creating daily task",
      error: error.message,
    });
  }
});

// Update a daily task
router.put("/:id", authenticateToken, async (req, res) => {
  try {
    const task = await DailyTask.findOne({
      _id: req.params.id,
      userId: req.user.userId,
    });

    if (!task) {
      return res.status(404).json({
        success: false,
        message: "Daily task not found",
      });
    }

    // Update fields
    const updatableFields = [
      "title",
      "description",
      "priority",
      "dateStarted",
      "dateEnded",
      "dailyStartTime",
      "dailyEndTime",
      "isActive",
    ];

    updatableFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        if (field === "dateStarted" || field === "dateEnded") {
          task[field] = new Date(req.body[field]);
        } else {
          task[field] = req.body[field];
        }
      }
    });

    await task.save();

    res.json({
      success: true,
      data: task,
      message: "Daily task updated successfully",
    });
  } catch (error) {
    console.error("Error updating daily task:", error);
    res.status(500).json({
      success: false,
      message: "Error updating daily task",
      error: error.message,
    });
  }
});

// Toggle task completion for today (or specified date)
router.patch("/:id/toggle-completion", authenticateToken, async (req, res) => {
  try {
    const { date } = req.body;
    const completionDate = date ? new Date(date) : new Date();

    const task = await DailyTask.findOne({
      _id: req.params.id,
      userId: req.user.userId,
    });

    if (!task) {
      return res.status(404).json({
        success: false,
        message: "Daily task not found",
      });
    }

    // Check current completion status
    const isCurrentlyCompleted = await DailyStats.isTaskCompleted(
      req.user.userId,
      task._id,
      completionDate
    );

    if (isCurrentlyCompleted) {
      // Unmark as completed
      await DailyStats.unmarkTaskCompleted(
        req.user.userId,
        task._id,
        completionDate
      );

      // Recalculate and update lastCompletedDate
      await DailyTask.recalculateLastCompletedDate(task._id, req.user.userId);
    } else {
      // Mark as completed and update lastCompletedDate
      await DailyStats.markTaskCompleted(
        req.user.userId,
        task._id,
        completionDate
      );

      // Update lastCompletedDate in the task
      task.lastCompletedDate = completionDate;
      await task.save();
    }

    // Check if all daily tasks are completed for today
    const todaysDate = date ? new Date(date) : new Date();
    const allTasks = await DailyTask.getActiveTasks(
      req.user.userId,
      todaysDate
    );

    let allCompleted = true;
    for (const t of allTasks) {
      const completed = await DailyStats.isTaskCompleted(
        req.user.userId,
        t._id,
        todaysDate
      );
      if (!completed) {
        allCompleted = false;
        break;
      }
    }

    // If all tasks completed and we just completed a task, update lastCompletedDate for all tasks
    if (allCompleted && !isCurrentlyCompleted) {
      await Promise.all(
        allTasks.map(async (t) => {
          t.lastCompletedDate = todaysDate;
          return t.save();
        })
      );
    }

    // If we unchecked a task and it was previously all completed, recalculate all tasks
    if (isCurrentlyCompleted && !allCompleted) {
      await Promise.all(
        allTasks.map(async (t) => {
          return DailyTask.recalculateLastCompletedDate(t._id, req.user.userId);
        })
      );
    }

    res.json({
      success: true,
      data: {
        taskId: task._id,
        isCompleted: !isCurrentlyCompleted,
        allTasksCompleted: allCompleted,
      },
      message: `Task marked as ${
        !isCurrentlyCompleted ? "completed" : "incomplete"
      }`,
    });
  } catch (error) {
    console.error("Error toggling task completion:", error);
    res.status(500).json({
      success: false,
      message: "Error toggling task completion",
      error: error.message,
    });
  }
});

// Delete a daily task
router.delete("/:id", authenticateToken, async (req, res) => {
  try {
    const task = await DailyTask.findOneAndDelete({
      _id: req.params.id,
      userId: req.user.userId,
    });

    if (!task) {
      return res.status(404).json({
        success: false,
        message: "Daily task not found",
      });
    }

    // Also delete all completion records for this task
    await DailyStats.deleteMany({
      userId: req.user.userId,
      taskId: req.params.id,
    });

    res.json({
      success: true,
      message: "Daily task deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting daily task:", error);
    res.status(500).json({
      success: false,
      message: "Error deleting daily task",
      error: error.message,
    });
  }
});

// Get daily streak information for a user
router.get("/streak/info", authenticateToken, async (req, res) => {
  try {
    const streakInfo = await DailyTask.calculateDailyStreak(req.user.userId);

    // Get additional stats
    const totalTasks = await DailyTask.countDocuments({
      userId: req.user.userId,
      isActive: true,
    });

    const today = new Date();
    const todayStart = new Date(today);
    todayStart.setHours(0, 0, 0, 0);

    const todayStats = await DailyStats.getUserStats(
      req.user.userId,
      todayStart,
      today
    );

    res.json({
      success: true,
      data: {
        currentStreak: streakInfo.currentStreak,
        longestStreak: streakInfo.longestStreak,
        totalActiveTasks: totalTasks,
        completedToday: todayStats.length,
      },
    });
  } catch (error) {
    console.error("Error getting streak info:", error);
    res.status(500).json({
      success: false,
      message: "Error getting streak information",
      error: error.message,
    });
  }
});

// Get completion history for a date range
router.get("/stats/history", authenticateToken, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const stats = await DailyStats.getUserStats(
      req.user.userId,
      startDate,
      endDate
    );

    // Group by date
    const groupedStats = stats.reduce((acc, stat) => {
      const dateKey = stat.completedDate.toISOString().split("T")[0];
      if (!acc[dateKey]) {
        acc[dateKey] = [];
      }
      acc[dateKey].push(stat);
      return acc;
    }, {});

    res.json({
      success: true,
      data: {
        stats: groupedStats,
        totalCompletions: stats.length,
      },
    });
  } catch (error) {
    console.error("Error getting completion history:", error);
    res.status(500).json({
      success: false,
      message: "Error getting completion history",
      error: error.message,
    });
  }
});

module.exports = router;
