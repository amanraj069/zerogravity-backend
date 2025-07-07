const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { getTokenFromRequest } = require("../utils/sessionUtils");

const authenticateToken = async (req, res, next) => {
  try {
    // Get token from cookies or Authorization header
    const token = getTokenFromRequest(req);

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Access denied. No token provided.",
      });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Get user from database using custom userId
    const user = await User.findOne({ userId: decoded.userId }).select(
      "-password"
    );

    if (!user || !user.isActive) {
      return res.status(401).json({
        success: false,
        message: "Invalid token or user not found.",
      });
    }

    req.user = user;
    req.userId = user.userId; // Add custom userId to request for convenience
    next();
  } catch (error) {
    if (error.name === "JsonWebTokenError") {
      return res.status(401).json({
        success: false,
        message: "Invalid token.",
      });
    }

    if (error.name === "TokenExpiredError") {
      return res.status(401).json({
        success: false,
        message: "Token expired.",
      });
    }

    res.status(500).json({
      success: false,
      message: "Server error during authentication.",
    });
  }
};

module.exports = { authenticateToken };
