const express = require("express");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { authenticateToken } = require("../middleware/auth");

const router = express.Router();

// Generate JWT Token
const generateToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: "7d",
  });
};

// Set token cookie
const setTokenCookie = (res, token) => {
  res.cookie("token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  });
};

// @route   POST /api/auth/signup
// @desc    Register a new user
// @access  Public
router.post("/signup", async (req, res) => {
  try {
    const { username, email, password, name } = req.body;

    // Validate required fields
    if (!username || !email || !password || !name) {
      return res.status(400).json({
        success: false,
        message: "Please provide all required fields",
      });
    }

    // Check if user already exists (case-insensitive for both email and username)
    const existingUser = await User.findOne({
      $or: [
        { email: email.toLowerCase() },
        { username: username.toLowerCase() },
      ],
    });

    if (existingUser) {
      const field =
        existingUser.email.toLowerCase() === email.toLowerCase()
          ? "email"
          : "username";
      return res.status(400).json({
        success: false,
        message: `User with this ${field} already exists`,
      });
    }

    // Split name into first and last name
    const nameParts = name.trim().split(" ");
    const firstName = nameParts[0];
    const lastName = nameParts.slice(1).join(" ") || firstName; // Use first name as last name if no last name provided

    // Create new user
    const user = new User({
      username,
      email,
      password,
      firstName,
      lastName,
    });

    await user.save();

    // Generate token
    const token = generateToken(user._id);
    setTokenCookie(res, token);

    res.status(201).json({
      success: true,
      message: "User registered successfully",
      user: user.toJSON(),
      token,
    });
  } catch (error) {
    if (error.name === "ValidationError") {
      const errors = Object.values(error.errors).map((err) => err.message);
      return res.status(400).json({
        success: false,
        message: "Validation error",
        errors,
      });
    }

    res.status(500).json({
      success: false,
      message: "Server error during registration",
    });
  }
});

// @route   POST /api/auth/login
// @desc    Login user
// @access  Public
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate required fields
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Please provide email and password",
      });
    }

    // Find user by email
    const user = await User.findOne({ email: email.toLowerCase() });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    // Check if user is active
    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        message: "Account is deactivated",
      });
    }

    // Check password
    const isPasswordValid = await user.comparePassword(password);

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    // Generate token
    const token = generateToken(user._id);
    setTokenCookie(res, token);

    res.json({
      success: true,
      message: "Login successful",
      user: user.toJSON(),
      token,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error during login",
    });
  }
});

// @route   POST /api/auth/logout
// @desc    Logout user
// @access  Private
router.post("/logout", (req, res) => {
  res.clearCookie("token");
  res.json({
    success: true,
    message: "Logged out successfully",
  });
});

// @route   GET /api/auth/me
// @desc    Get current user
// @access  Private
router.get("/me", authenticateToken, (req, res) => {
  res.json({
    success: true,
    user: req.user,
  });
});

// @route   GET /api/auth/verify
// @desc    Verify token
// @access  Private
router.get("/verify", authenticateToken, (req, res) => {
  res.json({
    success: true,
    message: "Token is valid",
    user: req.user,
  });
});

// @route   GET /api/auth/check-username/:username
// @desc    Check if username is available
// @access  Public
router.get("/check-username/:username", async (req, res) => {
  try {
    const { username } = req.params;

    // Validate username format
    if (!username || username.length < 3) {
      return res.status(400).json({
        success: false,
        message: "Username must be at least 3 characters",
      });
    }

    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      return res.status(400).json({
        success: false,
        message: "Username can only contain letters, numbers, and underscores",
      });
    }

    // Check if username exists (case-insensitive)
    const existingUser = await User.findOne({
      username: username.toLowerCase(),
    });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "Username is already taken",
        available: false,
      });
    }

    res.json({
      success: true,
      message: "Username is available",
      available: true,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error during username validation",
    });
  }
});

module.exports = router;
