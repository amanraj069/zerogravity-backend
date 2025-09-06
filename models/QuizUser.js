const mongoose = require("mongoose");

const generateId = () => {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < 16; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

const responseSchema = new mongoose.Schema(
  {
    questionId: { type: String, required: true },
    selectedOptionKey: { type: String, required: true },
    timeLeftSeconds: { type: Number, min: 0 },
    awardedMarks: { type: Number, min: 0, default: 0 },
  },
  { _id: false }
);

const quizUserSchema = new mongoose.Schema(
  {
    quizUserId: { type: String, unique: true },
    quizId: { type: String, index: true, required: true },
    joinCode: { type: String, index: true },
    participantName: { type: String, required: true, maxlength: 60 },
    participantUserId: { type: String },
    totalScore: { type: Number, default: 0 },
    responses: { type: [responseSchema], default: [] },
    joinedAt: { type: Date, default: Date.now },
    lastAnswerAt: { type: Date },
  },
  { timestamps: true }
);

// Prevent duplicate rows per user per quiz when logged in
quizUserSchema.index(
  { quizId: 1, participantUserId: 1 },
  { unique: true, sparse: true }
);

quizUserSchema.pre("save", function (next) {
  if (this.isNew && !this.quizUserId) {
    this.quizUserId = generateId();
  }
  next();
});

module.exports = mongoose.model("QuizUser", quizUserSchema, "quiz_users");
