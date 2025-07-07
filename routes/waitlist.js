const express = require("express");
const Waitlist = require("../models/Waitlist");

const router = express.Router();

// POST /api/waitlist/join - Join the waitlist
router.post("/join", async (req, res) => {
  try {
    const { name, email } = req.body;

    // Validate required fields
    if (!name || !email) {
      return res.status(400).json({
        success: false,
        message: "Name and email are required",
      });
    }

    // Validate name length
    if (name.trim().length < 2) {
      return res.status(400).json({
        success: false,
        message: "Name must be at least 2 characters long",
      });
    }

    if (name.trim().length > 50) {
      return res.status(400).json({
        success: false,
        message: "Name cannot exceed 50 characters",
      });
    }

    // Check if email already exists in waitlist
    const existingEmail = await Waitlist.findOne({
      email: email.toLowerCase(),
    });
    if (existingEmail) {
      return res.status(400).json({
        success: false,
        message: "Email already registered in waitlist",
      });
    }

    // Create new waitlist entry
    const waitlistEntry = new Waitlist({
      name: name.trim(),
      email: email.toLowerCase(),
    });

    await waitlistEntry.save();

    // Get current waitlist count
    const waitlistCount = await Waitlist.countDocuments();

    res.status(201).json({
      success: true,
      message: "Successfully joined the waitlist!",
      data: {
        name: waitlistEntry.name,
        email: waitlistEntry.email,
        joinedAt: waitlistEntry.joinedAt,
        totalCount: waitlistCount,
      },
    });
  } catch (error) {
    console.error("Waitlist join error:", error);

    // Handle validation errors
    if (error.name === "ValidationError") {
      return res.status(400).json({
        success: false,
        message: "Invalid email format",
      });
    }

    // Handle duplicate key error (in case of race condition)
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "Email already registered in waitlist",
      });
    }

    res.status(500).json({
      success: false,
      message: "Failed to join waitlist. Please try again.",
    });
  }
});

// GET /api/waitlist/count - Get waitlist count
router.get("/count", async (req, res) => {
  try {
    const count = await Waitlist.countDocuments();

    res.json({
      success: true,
      data: {
        count,
      },
    });
  } catch (error) {
    console.error("Waitlist count error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get waitlist count",
    });
  }
});

// GET /api/waitlist/list - Get all waitlist entries (admin only - you can add auth middleware later)
router.get("/list", async (req, res) => {
  try {
    const waitlistEntries = await Waitlist.find()
      .select("name email joinedAt isNotified")
      .sort({ joinedAt: -1 });

    res.json({
      success: true,
      data: {
        entries: waitlistEntries,
        total: waitlistEntries.length,
      },
    });
  } catch (error) {
    console.error("Waitlist list error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get waitlist entries",
    });
  }
});

module.exports = router;
