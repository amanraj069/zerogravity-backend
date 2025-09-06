const mongoose = require("mongoose");

// Generate 16-char id like fn6TtN5divxkOrGh
const generateId = () => {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < 16; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

// Public code for joining (6 characters)
const generateJoinCode = () => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no confusing chars
  let result = "";
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

const optionSchema = new mongoose.Schema(
  {
    key: { type: String, required: true }, // e.g., A/B/C/D
    text: { type: String, required: true },
    isCorrect: { type: Boolean, default: false },
  },
  { _id: false }
);

const questionSchema = new mongoose.Schema(
  {
    questionId: { type: String, unique: true },
    text: { type: String, required: true },
    options: {
      type: [optionSchema],
      validate: (v) => Array.isArray(v) && v.length >= 2,
    },
    timeLimitSeconds: { type: Number, min: 5, max: 600, default: 60 },
    maxMarks: { type: Number, min: 1, max: 1000, default: 10 },
  },
  { _id: false }
);

const quizSchema = new mongoose.Schema(
  {
    quizId: { type: String, unique: true },
    ownerUserId: { type: String, index: true, required: true },
    title: { type: String, required: true, maxlength: 120 },
    description: { type: String, maxlength: 2000 },
    joinCode: { type: String, unique: true, sparse: true },
    status: {
      type: String,
      enum: ["draft", "published", "active", "ended"],
      default: "draft",
    },
    questions: {
      type: [questionSchema],
      validate: (v) => Array.isArray(v) && v.length <= 100,
      default: [],
    },
    currentQuestionIndex: { type: Number, default: -1 },
    startedAt: { type: Date },
    endedAt: { type: Date },
  },
  { timestamps: true }
);

quizSchema.pre("save", async function (next) {
  try {
    if (this.isNew && !this.quizId) {
      this.quizId = generateId();
    }
    // Assign ids to questions
    if (this.isModified("questions")) {
      this.questions = this.questions.map((q) => ({
        questionId: q.questionId || generateId(),
        text: q.text,
        options: q.options,
        timeLimitSeconds: q.timeLimitSeconds,
        maxMarks: q.maxMarks,
      }));
    }
    next();
  } catch (err) {
    next(err);
  }
});

quizSchema.methods.generateJoinCodeIfNeeded = async function () {
  if (this.joinCode) return this.joinCode;
  let attempts = 0;
  while (attempts < 10) {
    const code = generateJoinCode();
    const exists = await this.constructor.findOne({ joinCode: code });
    if (!exists) {
      this.joinCode = code;
      return code;
    }
    attempts++;
  }
  throw new Error("Failed to generate unique join code");
};

quizSchema.methods.generateFreshJoinCode = async function () {
  let attempts = 0;
  while (attempts < 10) {
    const code = generateJoinCode();
    const exists = await this.constructor.findOne({ joinCode: code });
    if (!exists) {
      this.joinCode = code;
      return code;
    }
    attempts++;
  }
  throw new Error("Failed to generate unique join code");
};

module.exports = mongoose.model("Quiz", quizSchema);
