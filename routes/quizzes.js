const express = require("express");
const { authenticateToken } = require("../middleware/auth");
const Quiz = require("../models/Quiz");
const QuizUser = require("../models/QuizUser");

const router = express.Router();

// Generate ID function (same as in models)
const generateId = () => {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < 16; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

// Guard: only pro users can create/manage quizzes
const requirePro = (req, res, next) => {
  console.log("requirePro middleware - user:", req.user);
  console.log("User subscription:", req.user?.subscription);
  if (!req.user || req.user.subscription !== "pro") {
    console.log("Pro subscription check failed");
    return res
      .status(403)
      .json({ success: false, message: "Pro subscription required" });
  }
  next();
};

// Guard: admin only
const requireAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== "admin") {
    return res
      .status(403)
      .json({ success: false, message: "Admin access required" });
  }
  next();
};

// Helper: scrub question options for participants (hide isCorrect)
const sanitizeQuestionForParticipant = (question) => {
  return {
    questionId: question.questionId,
    text: question.text,
    options: question.options.map((o) => ({ key: o.key, text: o.text })),
    timeLimitSeconds: question.timeLimitSeconds,
    maxMarks: question.maxMarks,
  };
};

// List user's own quizzes
router.get("/", authenticateToken, requirePro, async (req, res) => {
  try {
    const { search, limit = 20, page = 1 } = req.query;
    const filters = { ownerUserId: req.user.userId };

    if (search) {
      filters.$or = [
        { title: { $regex: String(search), $options: "i" } },
        { description: { $regex: String(search), $options: "i" } },
      ];
    }

    const take = Math.min(100, Number(limit) || 20);
    const skip = (Number(page) - 1) * take;

    const [quizzes, total] = await Promise.all([
      Quiz.find(filters)
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(take)
        .select(
          "quizId title description status joinCode questions createdAt updatedAt"
        ),
      Quiz.countDocuments(filters),
    ]);

    // Add participant count for each quiz
    const enrichedQuizzes = await Promise.all(
      quizzes.map(async (quiz) => {
        const participantCount = await QuizUser.countDocuments({
          quizId: quiz.quizId,
        });
        return {
          ...quiz.toObject(),
          participants: participantCount,
        };
      })
    );

    return res.json({
      success: true,
      data: enrichedQuizzes,
      pagination: {
        page: Number(page),
        limit: take,
        total,
        hasNext: skip + take < total,
        hasPrev: page > 1,
      },
    });
  } catch (err) {
    console.error("List user quizzes error", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// Create quiz (draft)
router.post("/", authenticateToken, async (req, res) => {
  try {
    console.log("Create quiz request body:", req.body);
    console.log("User creating quiz:", req.user);
    const { title, description, questions } = req.body || {};
    if (!title || typeof title !== "string") {
      return res
        .status(400)
        .json({ success: false, message: "Title is required" });
    }
    if (questions && questions.length > 100) {
      return res.status(400).json({
        success: false,
        message: "A quiz can have at most 100 questions",
      });
    }

    const quiz = new Quiz({
      ownerUserId: req.user.userId,
      title,
      description,
      questions: questions || [],
    });
    console.log("About to save quiz:", quiz);
    await quiz.save();
    console.log("Quiz saved successfully:", quiz);
    return res.json({ success: true, quiz });
  } catch (err) {
    console.error("Create quiz error", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// Publish quiz -> generate join code and set status
router.post(
  "/:quizId/publish",
  authenticateToken,
  requirePro,
  async (req, res) => {
    try {
      const { quizId } = req.params;
      const quiz = await Quiz.findOne({ quizId, ownerUserId: req.user.userId });
      if (!quiz)
        return res
          .status(404)
          .json({ success: false, message: "Quiz not found" });

      // Always generate a fresh join code when publishing
      await quiz.generateFreshJoinCode();
      quiz.status = "published";
      await quiz.save();

      return res.json({
        success: true,
        quizId: quiz.quizId,
        joinCode: quiz.joinCode,
      });
    } catch (err) {
      console.error("Publish quiz error", err);
      return res.status(500).json({ success: false, message: "Server error" });
    }
  }
);

// Update draft quiz (replace questions/title/description) - only when in draft
router.patch("/:quizId", authenticateToken, requirePro, async (req, res) => {
  try {
    const { quizId } = req.params;
    const { title, description, questions } = req.body || {};
    const quiz = await Quiz.findOne({ quizId, ownerUserId: req.user.userId });
    if (!quiz)
      return res
        .status(404)
        .json({ success: false, message: "Quiz not found" });
    if (quiz.status !== "draft")
      return res
        .status(400)
        .json({ success: false, message: "Only draft quizzes can be updated" });
    if (questions && questions.length > 100) {
      return res.status(400).json({
        success: false,
        message: "A quiz can have at most 100 questions",
      });
    }

    if (typeof title === "string") quiz.title = title;
    if (typeof description === "string") quiz.description = description;
    if (Array.isArray(questions)) quiz.questions = questions;
    await quiz.save();
    return res.json({ success: true, quiz });
  } catch (err) {
    console.error("Update draft quiz error", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// Get quiz (owner view)
router.get("/:quizId", authenticateToken, async (req, res) => {
  try {
    const { quizId } = req.params;
    const quiz = await Quiz.findOne({ quizId });
    if (!quiz)
      return res
        .status(404)
        .json({ success: false, message: "Quiz not found" });
    const isOwner = quiz.ownerUserId === req.user.userId;
    if (!isOwner)
      return res.status(403).json({ success: false, message: "Forbidden" });
    return res.json({ success: true, quiz });
  } catch (err) {
    console.error("Get quiz error", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// Join quiz via code
router.post("/join", async (req, res) => {
  try {
    const { joinCode, name, userId } = req.body || {};
    if (!joinCode || !name) {
      return res
        .status(400)
        .json({ success: false, message: "joinCode and name are required" });
    }
    const quiz = await Quiz.findOne({ joinCode });
    if (!quiz)
      return res
        .status(404)
        .json({ success: false, message: "Invalid join code" });
    if (quiz.status === "ended") {
      return res
        .status(400)
        .json({ success: false, message: "Quiz has ended" });
    }

    // If userId is provided, prevent joining another active quiz
    if (userId) {
      const existingLatest = await QuizUser.findOne({
        participantUserId: userId,
      }).sort({ createdAt: -1 });
      if (existingLatest) {
        const existingQuiz = await Quiz.findOne({
          quizId: existingLatest.quizId,
        });
        if (existingQuiz && existingQuiz.status !== "ended") {
          if (existingQuiz.quizId !== quiz.quizId) {
            return res.status(400).json({
              success: false,
              message:
                "You are already in another active quiz. Finish it before joining another.",
            });
          } else {
            // Same quiz: return existing participant instead of duplicating
            return res.json({
              success: true,
              quizId: quiz.quizId,
              quizUserId: existingLatest.quizUserId,
            });
          }
        }
      }
    }

    // Ensure uniqueness per quiz + participantUserId
    if (userId) {
      const existingSame = await QuizUser.findOne({
        quizId: quiz.quizId,
        participantUserId: userId,
      });
      if (existingSame) {
        return res.json({
          success: true,
          quizId: quiz.quizId,
          quizUserId: existingSame.quizUserId,
        });
      }
    }

    // Use upsert to avoid race condition creating duplicates in parallel tabs
    const now = new Date();
    const update = {
      $setOnInsert: {
        quizUserId: undefined,
        joinCode: quiz.joinCode,
        participantName: String(name).slice(0, 60),
        participantUserId: userId || undefined,
        totalScore: 0,
        responses: [],
        joinedAt: now,
        lastAnswerAt: undefined,
      },
    };
    let participant = await QuizUser.findOneAndUpdate(
      {
        quizId: quiz.quizId,
        participantUserId: userId || undefined,
        participantName: String(name).slice(0, 60),
      },
      update,
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    if (!participant.quizUserId) {
      // Assign generated id if newly inserted
      participant.quizUserId = generateId();
      await participant.save();
    }

    // notify host via socket
    const io = req.app.get("io");
    if (io)
      io.to(`quiz:${quiz.quizId}`).emit("participant:joined", {
        quizId: quiz.quizId,
        participant,
      });

    return res.json({
      success: true,
      quizId: quiz.quizId,
      quizUserId: participant.quizUserId,
    });
  } catch (err) {
    console.error("Join quiz error", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// Leave quiz (remove participant)
router.post("/:quizId/leave", async (req, res) => {
  try {
    const { quizId } = req.params;
    const { quizUserId } = req.body || {};

    if (!quizUserId) {
      return res
        .status(400)
        .json({ success: false, message: "quizUserId is required" });
    }

    const quiz = await Quiz.findOne({ quizId });
    if (!quiz) {
      return res
        .status(404)
        .json({ success: false, message: "Quiz not found" });
    }

    // Remove the participant from the quiz
    const participant = await QuizUser.findOneAndDelete({
      quizId,
      quizUserId,
    });

    if (!participant) {
      return res
        .status(404)
        .json({ success: false, message: "Participant not found" });
    }

    // Notify host via socket that participant left
    const io = req.app.get("io");
    if (io) {
      io.to(`quiz:${quiz.quizId}`).emit("participant:left", {
        quizId: quiz.quizId,
        quizUserId,
        participantName: participant.participantName,
      });
    }

    return res.json({ success: true });
  } catch (err) {
    console.error("Leave quiz error", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// List participants (owner)
router.get(
  "/:quizId/participants",
  authenticateToken,
  requirePro,
  async (req, res) => {
    try {
      const { quizId } = req.params;
      const quiz = await Quiz.findOne({ quizId, ownerUserId: req.user.userId });
      if (!quiz)
        return res
          .status(404)
          .json({ success: false, message: "Quiz not found" });
      const participants = await QuizUser.find({ quizId }).sort({
        createdAt: 1,
      });
      return res.json({ success: true, participants });
    } catch (err) {
      console.error("List participants error", err);
      return res.status(500).json({ success: false, message: "Server error" });
    }
  }
);

// Start quiz (owner)
router.post(
  "/:quizId/start",
  authenticateToken,
  requirePro,
  async (req, res) => {
    try {
      const { quizId } = req.params;
      const quiz = await Quiz.findOne({ quizId, ownerUserId: req.user.userId });
      if (!quiz)
        return res
          .status(404)
          .json({ success: false, message: "Quiz not found" });
      quiz.status = "active";
      quiz.startedAt = new Date();
      quiz.currentQuestionIndex = -1;
      await quiz.save();

      const io = req.app.get("io");
      if (io)
        io.to(`quiz:${quiz.quizId}`).emit("quiz:started", {
          quizId: quiz.quizId,
        });

      return res.json({ success: true });
    } catch (err) {
      console.error("Start quiz error", err);
      return res.status(500).json({ success: false, message: "Server error" });
    }
  }
);

// Push question (owner) by index
router.post(
  "/:quizId/push/:index",
  authenticateToken,
  requirePro,
  async (req, res) => {
    try {
      const { quizId, index } = req.params;
      const idx = parseInt(index, 10);
      const quiz = await Quiz.findOne({ quizId, ownerUserId: req.user.userId });
      if (!quiz)
        return res
          .status(404)
          .json({ success: false, message: "Quiz not found" });
      if (idx < 0 || idx >= quiz.questions.length) {
        return res
          .status(400)
          .json({ success: false, message: "Invalid question index" });
      }
      quiz.currentQuestionIndex = idx;
      await quiz.save();

      const question = quiz.questions[idx];
      const sanitized = sanitizeQuestionForParticipant(question);

      const io = req.app.get("io");
      if (io)
        io.to(`quiz:${quiz.quizId}`).emit("question:pushed", {
          quizId: quiz.quizId,
          index: idx,
          question: sanitized,
        });

      return res.json({ success: true, question });
    } catch (err) {
      console.error("Push question error", err);
      return res.status(500).json({ success: false, message: "Server error" });
    }
  }
);

// Submit answer (participant)
router.post("/:quizId/answer", async (req, res) => {
  try {
    const { quizId } = req.params;
    const { quizUserId, questionId, selectedOptionKey, timeLeftSeconds } =
      req.body || {};
    if (!quizUserId || !questionId || !selectedOptionKey) {
      return res
        .status(400)
        .json({ success: false, message: "Missing fields" });
    }

    const quiz = await Quiz.findOne({ quizId });
    if (!quiz)
      return res
        .status(404)
        .json({ success: false, message: "Quiz not found" });
    if (quiz.status !== "active") {
      return res
        .status(400)
        .json({ success: false, message: "Quiz not active" });
    }

    const question = quiz.questions.find((q) => q.questionId === questionId);
    if (!question)
      return res
        .status(404)
        .json({ success: false, message: "Question not found" });

    const participant = await QuizUser.findOne({ quizUserId, quizId });
    if (!participant)
      return res
        .status(404)
        .json({ success: false, message: "Participant not found" });

    const chosen = question.options.find(
      (o) => o.key === String(selectedOptionKey)
    );
    if (!chosen)
      return res
        .status(400)
        .json({ success: false, message: "Invalid option" });

    const timeLeft = Math.max(
      0,
      Math.min(Number(timeLeftSeconds || 0), question.timeLimitSeconds)
    );
    const isCorrect = !!question.options.find(
      (o) => o.key === chosen.key && o.isCorrect
    );
    const rawMarks = (timeLeft / question.timeLimitSeconds) * question.maxMarks;
    const awardedMarks = isCorrect ? Math.round(rawMarks * 100) / 100 : 0;

    // Check if already answered this question; if so, ignore update
    const already = participant.responses.find(
      (r) => r.questionId === questionId
    );
    if (!already) {
      participant.responses.push({
        questionId,
        selectedOptionKey: chosen.key,
        timeLeftSeconds: timeLeft,
        awardedMarks,
      });
      participant.totalScore += awardedMarks;
      participant.lastAnswerAt = new Date();
      await participant.save();
    }

    // Broadcast vote update counts per option for current question to host
    const allForQuiz = await QuizUser.find({ quizId }, { responses: 1 });
    const counts = {};
    for (const opt of question.options) counts[opt.key] = 0;
    for (const pu of allForQuiz) {
      const r = (pu.responses || []).find((x) => x.questionId === questionId);
      if (r && counts.hasOwnProperty(r.selectedOptionKey))
        counts[r.selectedOptionKey] += 1;
    }
    const io = req.app.get("io");
    if (io)
      io.to(`quiz:${quiz.quizId}`).emit("votes:update", {
        quizId: quiz.quizId,
        questionId,
        counts,
      });

    return res.json({ success: true, awardedMarks });
  } catch (err) {
    console.error("Submit answer error", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// Leaderboard (owner)
router.get(
  "/:quizId/leaderboard",
  authenticateToken,
  requirePro,
  async (req, res) => {
    try {
      const { quizId } = req.params;
      const quiz = await Quiz.findOne({ quizId, ownerUserId: req.user.userId });
      if (!quiz)
        return res
          .status(404)
          .json({ success: false, message: "Quiz not found" });
      const leaderboard = await QuizUser.find({ quizId })
        .sort({ totalScore: -1, createdAt: 1 })
        .select("participantName totalScore quizUserId");
      return res.json({ success: true, leaderboard });
    } catch (err) {
      console.error("Leaderboard error", err);
      return res.status(500).json({ success: false, message: "Server error" });
    }
  }
);

// End quiz (owner)
router.post("/:quizId/end", authenticateToken, requirePro, async (req, res) => {
  try {
    const { quizId } = req.params;
    const quiz = await Quiz.findOne({ quizId, ownerUserId: req.user.userId });
    if (!quiz)
      return res
        .status(404)
        .json({ success: false, message: "Quiz not found" });

    quiz.status = "ended";
    quiz.endedAt = new Date();
    // Expire the join code when quiz ends
    quiz.joinCode = undefined;
    await quiz.save();

    const io = req.app.get("io");
    if (io)
      io.to(`quiz:${quiz.quizId}`).emit("quiz:ended", { quizId: quiz.quizId });

    return res.json({ success: true });
  } catch (err) {
    console.error("End quiz error", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// Participant: get current question (sanitized)
router.get("/:quizId/current", async (req, res) => {
  try {
    const { quizId } = req.params;
    const quiz = await Quiz.findOne({ quizId });
    if (!quiz)
      return res
        .status(404)
        .json({ success: false, message: "Quiz not found" });
    if (quiz.status !== "active" || quiz.currentQuestionIndex < 0) {
      return res.json({ success: true, index: -1, question: null });
    }
    const q = quiz.questions[quiz.currentQuestionIndex];
    const sanitized = sanitizeQuestionForParticipant(q);
    return res.json({
      success: true,
      index: quiz.currentQuestionIndex,
      question: sanitized,
    });
  } catch (err) {
    console.error("Get current question error", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// Clear participants for a quiz (owner)
router.post(
  "/:quizId/participants/clear",
  authenticateToken,
  requirePro,
  async (req, res) => {
    try {
      const { quizId } = req.params;
      const quiz = await Quiz.findOne({ quizId, ownerUserId: req.user.userId });
      if (!quiz)
        return res
          .status(404)
          .json({ success: false, message: "Quiz not found" });

      await QuizUser.deleteMany({ quizId });
      const io = req.app.get("io");
      if (io)
        io.to(`quiz:${quiz.quizId}`).emit("participants:cleared", {
          quizId: quiz.quizId,
        });
      return res.json({ success: true });
    } catch (err) {
      console.error("Clear participants error", err);
      return res.status(500).json({ success: false, message: "Server error" });
    }
  }
);

module.exports = router;
// Admin: list past quizzes (ended)
router.get("/admin/past", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { ownerUserId, limit = 50, page = 1, search = "" } = req.query;
    const filters = { status: "ended" };
    if (ownerUserId) filters.ownerUserId = String(ownerUserId);
    if (search) filters.title = { $regex: String(search), $options: "i" };

    const take = Math.min(100, Number(limit) || 50);
    const skip = (Number(page) - 1) * take;

    const [items, total] = await Promise.all([
      Quiz.find(filters)
        .sort({ endedAt: -1 })
        .skip(skip)
        .limit(take)
        .select("quizId title ownerUserId endedAt createdAt joinCode"),
      Quiz.countDocuments(filters),
    ]);

    return res.json({
      success: true,
      items,
      total,
      page: Number(page),
      limit: take,
    });
  } catch (err) {
    console.error("Admin list past quizzes error", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// Admin: quiz details with participants and leaderboard
router.get(
  "/admin/:quizId",
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const { quizId } = req.params;
      const quiz = await Quiz.findOne({ quizId });
      if (!quiz)
        return res
          .status(404)
          .json({ success: false, message: "Quiz not found" });
      const participants = await QuizUser.find({ quizId })
        .sort({ createdAt: 1 })
        .select("participantName totalScore quizUserId joinedAt");
      const board = await QuizUser.find({ quizId })
        .sort({ totalScore: -1, createdAt: 1 })
        .select("participantName totalScore quizUserId");
      return res.json({
        success: true,
        quiz,
        participants,
        leaderboard: board,
      });
    } catch (err) {
      console.error("Admin quiz details error", err);
      return res.status(500).json({ success: false, message: "Server error" });
    }
  }
);
