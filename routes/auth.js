const express = require("express");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const Settings = require("../models/Settings");
const { authenticateToken } = require("../middleware/auth");
const {
  setUserSessionCookies,
  clearUserSessionCookies,
} = require("../utils/sessionUtils");

const router = express.Router();

// Generate JWT Token
const generateToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: "7d",
  });
};

// @route   POST /api/auth/signup
// @desc    Register a new user
// @access  Public
router.post("/signup", async (req, res) => {
  try {
    // Check if signup is enabled
    const signupSetting = await Settings.findOne({ key: "signupEnabled" });
    const signupEnabled = signupSetting ? signupSetting.value : false;

    if (!signupEnabled) {
      return res.status(403).json({
        success: false,
        message: "Signup is currently disabled",
      });
    }

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

    // Generate token and set session cookies using custom userId
    const token = generateToken(user.userId);
    setUserSessionCookies(res, user.userId, token);

    res.status(201).json({
      success: true,
      message: "User registered successfully",
      user: user.toJSON(),
      userId: user.userId,
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

    // Generate token and set session cookies using custom userId
    const token = generateToken(user.userId);
    setUserSessionCookies(res, user.userId, token);

    res.json({
      success: true,
      message: "Login successful",
      user: user.toJSON(),
      userId: user.userId,
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
  clearUserSessionCookies(res);
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
    userId: req.user.userId,
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
    userId: req.user.userId,
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

// @route   GET /api/auth/signup-status
// @desc    Get signup enabled status
// @access  Public
router.get("/signup-status", async (req, res) => {
  try {
    const setting = await Settings.findOne({ key: "signupEnabled" });
    const enabled = setting ? setting.value : false; // Default to false if not set

    res.json({
      success: true,
      enabled: enabled,
    });
  } catch (error) {
    console.error("Get signup status error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
});

// @route   POST /api/auth/toggle-signup
// @desc    Toggle signup enabled status (Admin only)
// @access  Private
router.post("/toggle-signup", authenticateToken, async (req, res) => {
  try {
    console.log("Toggle signup request:", {
      userId: req.userId,
      enabled: req.body.enabled,
      userAgent: req.headers["user-agent"],
    });

    const { enabled } = req.body;

    if (typeof enabled !== "boolean") {
      return res.status(400).json({
        success: false,
        message: "Invalid enabled value. Must be boolean.",
      });
    }

    // Update or create the setting
    const updatedSetting = await Settings.findOneAndUpdate(
      { key: "signupEnabled" },
      { value: enabled, updatedAt: new Date() },
      { upsert: true, new: true }
    );

    console.log("Setting updated:", updatedSetting);

    res.json({
      success: true,
      enabled: enabled,
      message: `Signup ${enabled ? "enabled" : "disabled"} successfully`,
    });
  } catch (error) {
    console.error("Toggle signup error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
});

// @route   GET /api/auth/current-user-id
// @desc    Get current user ID from cookies (for frontend convenience)
// @access  Public
router.get("/current-user-id", (req, res) => {
  const userId = req.cookies.userId;

  if (!userId) {
    return res.status(404).json({
      success: false,
      message: "No user ID found in cookies",
      userId: null,
    });
  }

  res.json({
    success: true,
    userId: userId,
  });
});

// @route   GET /api/auth/session-status
// @desc    Check if user has a valid session
// @access  Public
router.get("/session-status", async (req, res) => {
  try {
    const token = req.cookies.token;
    const userId = req.cookies.userId;

    if (!token || !userId) {
      return res.json({
        success: true,
        isLoggedIn: false,
        message: "No active session found",
      });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Check if userId matches
    if (decoded.userId !== userId) {
      return res.json({
        success: true,
        isLoggedIn: false,
        message: "Session mismatch",
      });
    }

    // Get user to verify they still exist and are active
    const user = await User.findOne({ userId: userId }).select("-password");

    if (!user || !user.isActive) {
      return res.json({
        success: true,
        isLoggedIn: false,
        message: "User not found or inactive",
      });
    }

    res.json({
      success: true,
      isLoggedIn: true,
      userId: userId,
      user: user.toJSON(),
    });
  } catch (error) {
    res.json({
      success: true,
      isLoggedIn: false,
      message: "Invalid session",
    });
  }
});

// @route   GET /api/auth/debug
// @desc    Debug endpoint to check cookies and headers
// @access  Public
router.get("/debug", (req, res) => {
  console.log("=== DEBUG ENDPOINT ===");
  console.log("Request headers:", req.headers);
  console.log("Request cookies:", req.cookies);
  console.log("Request origin:", req.headers.origin);
  console.log("Request user-agent:", req.headers["user-agent"]);

  res.json({
    success: true,
    debug: {
      cookies: req.cookies,
      headers: {
        origin: req.headers.origin,
        userAgent: req.headers["user-agent"],
        authorization: req.headers.authorization,
        contentType: req.headers["content-type"],
      },
      hasToken: !!req.cookies.token,
      hasUserId: !!req.cookies.userId,
    },
  });
});

module.exports = router;
