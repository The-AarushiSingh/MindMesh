const mongoose = require("mongoose");

const conceptSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    normalizedName: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 200,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 1000,
    },
    resources: [{ type: mongoose.Schema.Types.ObjectId, ref: "Resource" }],
    topics: [{ type: mongoose.Schema.Types.ObjectId, ref: "Topic" }],
    relatedConcepts: [{ type: mongoose.Schema.Types.ObjectId, ref: "Concept" }],
    embedding: {
      type: [Number],
      default: [],
    },
    occurrenceCount: {
      type: Number,
      default: 0,
    },
    lastSeenAt: Date,
  },
  { timestamps: true }
);

conceptSchema.index({ user: 1, normalizedName: 1 }, { unique: true });

const Concept = mongoose.model("Concept", conceptSchema);

module.exports = Concept;
