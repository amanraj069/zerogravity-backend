const jwt = require("jsonwebtoken");

/**
 * Generate a random 16-character userId
 * @returns {String} - Random 16-character string
 */
const generateUserId = () => {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < 16; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

/**
 * Cookie Management Utilities for User Sessions
 */

// Cookie configuration
const COOKIE_CONFIG = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: process.env.NODE_ENV === "production" ? "none" : "lax", // Allow cross-origin cookies
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  domain: process.env.NODE_ENV === "production" ? undefined : undefined, // Don't set domain for localhost
};

const USER_ID_COOKIE_CONFIG = {
  httpOnly: false, // Allow frontend access
  secure: process.env.NODE_ENV === "production",
  sameSite: process.env.NODE_ENV === "production" ? "none" : "lax", // Allow cross-origin cookies
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  domain: process.env.NODE_ENV === "production" ? undefined : undefined, // Don't set domain for localhost
};

/**
 * Set authentication cookies for a user
 * @param {Object} res - Express response object
 * @param {String} userId - User ID
 * @param {String} token - JWT token
 */
const setUserSessionCookies = (res, userId, token) => {
  console.log("Setting cookies for user:", userId);
  console.log("Cookie config:", { COOKIE_CONFIG, USER_ID_COOKIE_CONFIG });

  // Set httpOnly token cookie for security
  res.cookie("token", token, COOKIE_CONFIG);

  // Set userId cookie for frontend convenience
  res.cookie("userId", userId.toString(), USER_ID_COOKIE_CONFIG);

  console.log("Cookies set successfully");
};

/**
 * Clear all user session cookies
 * @param {Object} res - Express response object
 */
const clearUserSessionCookies = (res) => {
  res.clearCookie("token");
  res.clearCookie("userId");
};

/**
 * Extract userId from request cookies
 * @param {Object} req - Express request object
 * @returns {String|null} - User ID or null if not found
 */
const getUserIdFromCookies = (req) => {
  return req.cookies.userId || null;
};

/**
 * Extract token from request cookies or headers
 * @param {Object} req - Express request object
 * @returns {String|null} - JWT token or null if not found
 */
const getTokenFromRequest = (req) => {
  console.log("Extracting token from request...");
  console.log("Request cookies:", req.cookies);
  console.log("Authorization header:", req.header("Authorization"));

  const token =
    req.cookies.token ||
    req.header("Authorization")?.replace("Bearer ", "") ||
    null;

  console.log("Extracted token:", token ? "Token found" : "No token found");
  return token;
};

/**
 * Verify if user session is valid
 * @param {Object} req - Express request object
 * @returns {Object} - Verification result with user info or error
 */
const verifyUserSession = async (req) => {
  try {
    const token = getTokenFromRequest(req);
    const userId = getUserIdFromCookies(req);

    if (!token) {
      return { valid: false, error: "No token provided" };
    }

    // Verify JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Check if userId from cookie matches token
    if (userId && decoded.userId !== userId) {
      return { valid: false, error: "Token and userId mismatch" };
    }

    return {
      valid: true,
      userId: decoded.userId,
      tokenData: decoded,
    };
  } catch (error) {
    if (error.name === "JsonWebTokenError") {
      return { valid: false, error: "Invalid token" };
    }
    if (error.name === "TokenExpiredError") {
      return { valid: false, error: "Token expired" };
    }
    return { valid: false, error: "Session verification failed" };
  }
};

module.exports = {
  setUserSessionCookies,
  clearUserSessionCookies,
  getUserIdFromCookies,
  getTokenFromRequest,
  verifyUserSession,
  generateUserId,
  COOKIE_CONFIG,
  USER_ID_COOKIE_CONFIG,
};
