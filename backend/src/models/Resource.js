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
      trim: true,
      maxlength: 2048,
      default: "",
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
    relationships: [{ type: String, trim: true }],
    difficulty: {
      type: String,
      enum: ["beginner", "intermediate", "advanced"],
      default: "beginner",
    },
    embedding: {
      type: [Number],
      select: false,
    },
    embeddingSource: {
      type: String,
      enum: ["provider", "unavailable"],
      default: "unavailable",
    },
    embeddingModel: {
      type: String,
      trim: true,
      default: "",
    },
    chunkCount: {
      type: Number,
      default: 0,
    },
    contentSource: {
      type: String,
      enum: ["fetched", "note", "limited"],
      default: "fetched",
    },
    extractionNote: {
      type: String,
      trim: true,
      maxlength: 500,
      default: "",
    },
    analysisSource: {
      type: String,
      enum: ["provider", "heuristic", "unavailable"],
      default: "unavailable",
    },
    providerModel: {
      type: String,
      trim: true,
      default: "",
    },
    retrievalMode: {
      type: String,
      enum: ["embedding", "lexical-fallback"],
      default: "lexical-fallback",
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
      default: "",
    },

    jobAttempts: {
      type: Number,
      default: 0,
    },

    processingStartedAt: Date,
    processedAt: Date,
  },
  {
    timestamps: true,
  }
);

resourceSchema.index({ user: 1, createdAt: -1 });
resourceSchema.index({ user: 1, status: 1 });
resourceSchema.index(
  { user: 1, url: 1 },
  {
    unique: true,
    partialFilterExpression: { url: { $type: "string", $gt: "" } },
  }
);

const Resource = mongoose.model("Resource", resourceSchema);

module.exports = Resource;