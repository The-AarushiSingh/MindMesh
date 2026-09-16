const mongoose = require("mongoose");

const resourceSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    title: {
      type: String,
      trim: true,
      maxlength: 300,
    },

    url: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2048,
    },

    type: {
      type: String,
      enum: [
        "article",
        "x-post",
        "linkedin-post",
        "youtube",
        "documentation",
        "github",
        "note",
        "other",
      ],
      default: "other",
    },

    description: {
      type: String,
      trim: true,
      maxlength: 2000,
    },

    summary: {
      type: String,
      trim: true,
      maxlength: 2000,
    },

    content: {
      type: String,
      trim: true,
    },

    topics: [{ type: String, trim: true }],
    concepts: [{ type: String, trim: true }],
    keyIdeas: [{ type: String, trim: true }],
    prerequisites: [{ type: String, trim: true }],
    difficulty: {
      type: String,
      enum: ["beginner", "intermediate", "advanced"],
      default: "beginner",
    },

    status: {
      type: String,
      enum: ["saved", "processing", "processed", "failed"],
      default: "saved",
    },

    error: {
      type: String,
      trim: true,
      maxlength: 1000,
    },
  },
  {
    timestamps: true,
  }
);

const Resource = mongoose.model("Resource", resourceSchema);

module.exports = Resource;