const mongoose = require("mongoose");

// Subtask schema
const subtaskSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      required: true,
    },
    title: {
      type: String,
      required: [true, "Subtask title is required"],
      trim: true,
      maxlength: [200, "Subtask title cannot exceed 200 characters"],
    },
    completed: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Milestone schema
const milestoneSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      required: true,
    },
    title: {
      type: String,
      required: [true, "Milestone title is required"],
      trim: true,
      maxlength: [200, "Milestone title cannot exceed 200 characters"],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [1000, "Milestone description cannot exceed 1000 characters"],
    },
    targetDate: {
      type: Date,
      required: [true, "Milestone target date is required"],
    },
    completed: {
      type: Boolean,
      default: false,
    },
    subtasks: [subtaskSchema],
  },
  {
    timestamps: true,
  }
);

// Main Goal schema
const goalSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: [true, "User ID is required"],
      ref: "User",
    },
    title: {
      type: String,
      required: [true, "Goal title is required"],
      trim: true,
      maxlength: [200, "Goal title cannot exceed 200 characters"],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [1000, "Goal description cannot exceed 1000 characters"],
    },
    category: {
      type: String,
      required: [true, "Goal category is required"],
      enum: {
        values: ["weekly", "monthly", "quarterly", "yearly"],
        message: "Category must be one of: weekly, monthly, quarterly, yearly",
      },
    },
    priority: {
      type: String,
      required: [true, "Goal priority is required"],
      enum: {
        values: ["low", "medium", "high"],
        message: "Priority must be one of: low, medium, high",
      },
      default: "medium",
    },
    targetDate: {
      type: Date,
      required: [true, "Target date is required"],
    },
    completed: {
      type: Boolean,
      default: false,
    },
    completedAt: {
      type: Date,
    },
    milestones: [milestoneSchema],
  },
  {
    timestamps: true,
  }
);

// Indexes for better query performance
goalSchema.index({ userId: 1, createdAt: -1 });
goalSchema.index({ userId: 1, category: 1 });
goalSchema.index({ userId: 1, completed: 1 });
goalSchema.index({ userId: 1, targetDate: 1 });

// Virtual for calculating progress
goalSchema.virtual("progress").get(function () {
  if (this.completed) return 100;
  if (this.milestones.length === 0) return 0;

  const completedMilestones = this.milestones.filter((m) => m.completed).length;
  return Math.round((completedMilestones / this.milestones.length) * 100);
});

// Method to calculate milestone progress
milestoneSchema.virtual("progress").get(function () {
  if (this.completed) return 100;
  if (this.subtasks.length === 0) return 0;

  const completedSubtasks = this.subtasks.filter((s) => s.completed).length;
  return Math.round((completedSubtasks / this.subtasks.length) * 100);
});

// Ensure virtual fields are serialized
goalSchema.set("toJSON", { virtuals: true });
goalSchema.set("toObject", { virtuals: true });
milestoneSchema.set("toJSON", { virtuals: true });
milestoneSchema.set("toObject", { virtuals: true });

// Middleware to set completedAt when goal is marked as completed
goalSchema.pre("save", function (next) {
  if (this.isModified("completed") && this.completed && !this.completedAt) {
    this.completedAt = new Date();
  } else if (this.isModified("completed") && !this.completed) {
    this.completedAt = undefined;
  }
  next();
});

// Static method to get goals with analytics
goalSchema.statics.getGoalsWithAnalytics = async function (userId) {
  const goals = await this.find({ userId }).sort({ createdAt: -1 });

  // Calculate streak data
  const completedGoals = goals.filter((goal) => goal.completed);
  const totalCompleted = completedGoals.length;

  let currentStreak = 0;
  let longestStreak = 0;
  let tempStreak = 0;

  const sortedCompletedGoals = completedGoals.sort(
    (a, b) =>
      new Date(a.completedAt || a.createdAt).getTime() -
      new Date(b.completedAt || b.createdAt).getTime()
  );

  sortedCompletedGoals.forEach((goal, index) => {
    if (index === 0) {
      tempStreak = 1;
    } else {
      const prevDate = new Date(
        sortedCompletedGoals[index - 1].completedAt ||
          sortedCompletedGoals[index - 1].createdAt
      );
      const currentDate = new Date(goal.completedAt || goal.createdAt);
      const daysDiff = Math.abs(
        (currentDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24)
      );

      if (daysDiff <= 7) {
        tempStreak++;
      } else {
        tempStreak = 1;
      }
    }

    if (tempStreak > longestStreak) {
      longestStreak = tempStreak;
    }

    if (index === sortedCompletedGoals.length - 1) {
      currentStreak = tempStreak;
    }
  });

  const analytics = {
    currentStreak,
    longestStreak,
    totalCompleted,
    totalGoals: goals.length,
    completionRate:
      goals.length > 0 ? Math.round((totalCompleted / goals.length) * 100) : 0,
  };

  return { goals, analytics };
};

module.exports = mongoose.model("Goal", goalSchema);
