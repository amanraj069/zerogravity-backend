const mongoose = require("mongoose");
const User = require("./models/User");
require("dotenv").config();

/**
 * Migration script to add userId field to existing users
 * This should be run once after updating the User model
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

const migrateUsers = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("Connected to MongoDB for migration");

    // Find all users without userId field
    const usersWithoutUserId = await User.find({
      $or: [{ userId: { $exists: false } }, { userId: null }, { userId: "" }],
    });

    console.log(`Found ${usersWithoutUserId.length} users without userId`);

    for (const user of usersWithoutUserId) {
      let isUnique = false;
      let attempts = 0;
      let newUserId;

      // Generate unique userId
      while (!isUnique && attempts < 10) {
        newUserId = generateUserId();
        const existingUser = await User.findOne({ userId: newUserId });

        if (!existingUser) {
          isUnique = true;
        } else {
          attempts++;
        }
      }

      if (isUnique) {
        // Update user with new userId
        await User.updateOne(
          { _id: user._id },
          { $set: { userId: newUserId } }
        );
        console.log(`Updated user ${user.email} with userId: ${newUserId}`);
      } else {
        console.error(
          `Failed to generate unique userId for user ${user.email}`
        );
      }
    }

    console.log("Migration completed successfully");
  } catch (error) {
    console.error("Migration failed:", error);
  } finally {
    await mongoose.disconnect();
    console.log("Disconnected from MongoDB");
  }
};

// Run migration if this file is executed directly
if (require.main === module) {
  migrateUsers();
}

module.exports = { migrateUsers };
