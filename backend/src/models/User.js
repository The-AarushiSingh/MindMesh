const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    password: {
      type: String,
      required: true,
    },

    emailVerified: {
      type: Boolean,
      default: false,
    },

    verificationCodeHash: {
      type: String,
      select: false,
    },

    verificationExpiresAt: Date,
    verificationSentAt: Date,

    verificationAttempts: {
      type: Number,
      default: 0,
    },

    verificationConsumed: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

//turns the schema into something our application can actually use to interact with MongoDB.
const User = mongoose.model("User", userSchema);

module.exports = User;