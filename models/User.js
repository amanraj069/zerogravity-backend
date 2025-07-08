const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

// Function to generate random userId
const generateUserId = () => {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < 16; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

const userSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      unique: true,
      length: 16,
    },
    username: {
      type: String,
      required: [true, "Username is required"],
      unique: true,
      trim: true,
      lowercase: true,
      minlength: [3, "Username must be at least 3 characters long"],
      maxlength: [20, "Username cannot exceed 20 characters"],
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      trim: true,
      lowercase: true,
      match: [
        /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
        "Please enter a valid email",
      ],
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: [6, "Password must be at least 6 characters long"],
    },
    firstName: {
      type: String,
      required: [true, "First name is required"],
      trim: true,
      maxlength: [50, "First name cannot exceed 50 characters"],
    },
    lastName: {
      type: String,
      required: [true, "Last name is required"],
      trim: true,
      maxlength: [50, "Last name cannot exceed 50 characters"],
    },
    role: {
      type: String,
      enum: ["student", "admin"],
      default: "student",
      required: [true, "Role is required"],
    },
    subscription: {
      type: String,
      enum: ["basic", "pro"],
      default: "basic",
      required: [true, "Subscription is required"],
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

// Ensure userId is unique before saving
userSchema.pre("save", async function (next) {
  // Always generate userId for new users or if userId is missing
  if (this.isNew || !this.userId) {
    let isUnique = false;
    let attempts = 0;
    const maxAttempts = 10;

    while (!isUnique && attempts < maxAttempts) {
      try {
        this.userId = generateUserId();

        const existingUser = await this.constructor.findOne({
          userId: this.userId,
        });
        if (!existingUser) {
          isUnique = true;
        } else {
          attempts++;
        }
      } catch (error) {
        return next(error);
      }
    }

    if (!isUnique) {
      return next(new Error("Failed to generate unique userId"));
    }
  }
  next();
});

// Validate username format before saving
userSchema.pre("save", async function (next) {
  if (this.isModified("username")) {
    // Validate username format (before it gets converted to lowercase by schema)
    const originalUsername = this.username;
    if (!/^[a-zA-Z0-9_]+$/.test(originalUsername)) {
      return next(
        new Error("Username can only contain letters, numbers, and underscores")
      );
    }
  }
  next();
});

// Hash password before saving
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();

  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Compare password method
userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Remove password from JSON output
userSchema.methods.toJSON = function () {
  const user = this.toObject();
  delete user.password;
  return user;
};

module.exports = mongoose.model("User", userSchema);
