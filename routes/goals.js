const express = require("express");
const Goal = require("../models/Goal");
const { authenticateToken } = require("../middleware/auth");

const router = express.Router();

// Get all goals for a user with analytics
router.get("/", authenticateToken, async (req, res) => {
  try {
    const { goals, analytics } = await Goal.getGoalsWithAnalytics(
      req.user.userId
    );

    res.json({
      success: true,
      data: {
        goals,
        analytics,
      },
    });
  } catch (error) {
    console.error("Error fetching goals:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching goals",
      error: error.message,
    });
  }
});

// Get a specific goal by ID
router.get("/:id", authenticateToken, async (req, res) => {
  try {
    const goal = await Goal.findOne({
      _id: req.params.id,
      userId: req.user.userId,
    });

    if (!goal) {
      return res.status(404).json({
        success: false,
        message: "Goal not found",
      });
    }

    res.json({
      success: true,
      data: goal,
    });
  } catch (error) {
    console.error("Error fetching goal:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching goal",
      error: error.message,
    });
  }
});

// Create a new goal
router.post("/", authenticateToken, async (req, res) => {
  try {
    const {
      title,
      description,
      category,
      priority,
      targetDate,
      milestones = [],
    } = req.body;

    // Validate required fields
    if (!title || !category || !targetDate) {
      return res.status(400).json({
        success: false,
        message: "Title, category, and target date are required",
      });
    }

    // Generate unique IDs for milestones and subtasks
    const processedMilestones = milestones.map((milestone, index) => ({
      ...milestone,
      id: `${Date.now()}-milestone-${index}`,
      subtasks: (milestone.subtasks || []).map((subtask, subIndex) => ({
        ...subtask,
        id: `${Date.now()}-subtask-${index}-${subIndex}`,
      })),
    }));

    const goal = new Goal({
      userId: req.user.userId,
      title,
      description,
      category,
      priority: priority || "medium",
      targetDate: new Date(targetDate),
      milestones: processedMilestones,
    });

    await goal.save();

    res.status(201).json({
      success: true,
      data: goal,
      message: "Goal created successfully",
    });
  } catch (error) {
    console.error("Error creating goal:", error);
    res.status(500).json({
      success: false,
      message: "Error creating goal",
      error: error.message,
    });
  }
});

// Update a goal
router.put("/:id", authenticateToken, async (req, res) => {
  try {
    const goal = await Goal.findOne({
      _id: req.params.id,
      userId: req.user.userId,
    });

    if (!goal) {
      return res.status(404).json({
        success: false,
        message: "Goal not found",
      });
    }

    // Update fields
    const allowedUpdates = [
      "title",
      "description",
      "category",
      "priority",
      "targetDate",
      "completed",
      "milestones",
    ];

    allowedUpdates.forEach((field) => {
      if (req.body[field] !== undefined) {
        if (field === "targetDate") {
          goal[field] = new Date(req.body[field]);
        } else {
          goal[field] = req.body[field];
        }
      }
    });

    await goal.save();

    res.json({
      success: true,
      data: goal,
      message: "Goal updated successfully",
    });
  } catch (error) {
    console.error("Error updating goal:", error);
    res.status(500).json({
      success: false,
      message: "Error updating goal",
      error: error.message,
    });
  }
});

// Toggle goal completion
router.patch("/:id/toggle-completion", authenticateToken, async (req, res) => {
  try {
    const goal = await Goal.findOne({
      _id: req.params.id,
      userId: req.user.userId,
    });

    if (!goal) {
      return res.status(404).json({
        success: false,
        message: "Goal not found",
      });
    }

    goal.completed = !goal.completed;
    await goal.save();

    res.json({
      success: true,
      data: goal,
      message: `Goal marked as ${goal.completed ? "completed" : "incomplete"}`,
    });
  } catch (error) {
    console.error("Error toggling goal completion:", error);
    res.status(500).json({
      success: false,
      message: "Error toggling goal completion",
      error: error.message,
    });
  }
});

// Toggle milestone completion
router.patch(
  "/:goalId/milestones/:milestoneId/toggle-completion",
  authenticateToken,
  async (req, res) => {
    try {
      const goal = await Goal.findOne({
        _id: req.params.goalId,
        userId: req.user.userId,
      });

      if (!goal) {
        return res.status(404).json({
          success: false,
          message: "Goal not found",
        });
      }

      const milestone = goal.milestones.find(
        (m) => m.id === req.params.milestoneId
      );
      if (!milestone) {
        return res.status(404).json({
          success: false,
          message: "Milestone not found",
        });
      }

      milestone.completed = !milestone.completed;
      await goal.save();

      res.json({
        success: true,
        data: goal,
        message: `Milestone marked as ${
          milestone.completed ? "completed" : "incomplete"
        }`,
      });
    } catch (error) {
      console.error("Error toggling milestone completion:", error);
      res.status(500).json({
        success: false,
        message: "Error toggling milestone completion",
        error: error.message,
      });
    }
  }
);

// Toggle subtask completion
router.patch(
  "/:goalId/milestones/:milestoneId/subtasks/:subtaskId/toggle-completion",
  authenticateToken,
  async (req, res) => {
    try {
      const goal = await Goal.findOne({
        _id: req.params.goalId,
        userId: req.user.userId,
      });

      if (!goal) {
        return res.status(404).json({
          success: false,
          message: "Goal not found",
        });
      }

      const milestone = goal.milestones.find(
        (m) => m.id === req.params.milestoneId
      );
      if (!milestone) {
        return res.status(404).json({
          success: false,
          message: "Milestone not found",
        });
      }

      const subtask = milestone.subtasks.find(
        (s) => s.id === req.params.subtaskId
      );
      if (!subtask) {
        return res.status(404).json({
          success: false,
          message: "Subtask not found",
        });
      }

      subtask.completed = !subtask.completed;
      await goal.save();

      res.json({
        success: true,
        data: goal,
        message: `Subtask marked as ${
          subtask.completed ? "completed" : "incomplete"
        }`,
      });
    } catch (error) {
      console.error("Error toggling subtask completion:", error);
      res.status(500).json({
        success: false,
        message: "Error toggling subtask completion",
        error: error.message,
      });
    }
  }
);

// Delete a goal
router.delete("/:id", authenticateToken, async (req, res) => {
  try {
    const goal = await Goal.findOneAndDelete({
      _id: req.params.id,
      userId: req.user.userId,
    });

    if (!goal) {
      return res.status(404).json({
        success: false,
        message: "Goal not found",
      });
    }

    res.json({
      success: true,
      message: "Goal deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting goal:", error);
    res.status(500).json({
      success: false,
      message: "Error deleting goal",
      error: error.message,
    });
  }
});

// Get goals by category
router.get("/category/:category", authenticateToken, async (req, res) => {
  try {
    const { category } = req.params;
    const validCategories = ["weekly", "monthly", "quarterly", "yearly"];

    if (!validCategories.includes(category)) {
      return res.status(400).json({
        success: false,
        message: "Invalid category",
      });
    }

    const goals = await Goal.find({
      userId: req.user.userId,
      category,
    }).sort({ createdAt: -1 });

    res.json({
      success: true,
      data: goals,
    });
  } catch (error) {
    console.error("Error fetching goals by category:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching goals by category",
      error: error.message,
    });
  }
});

module.exports = router;
