const mongoose = require("mongoose");

const knowledgeGapSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    topic: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    concept: {
      type: String,
      trim: true,
      maxlength: 200,
      default: "",
    },
    why: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000,
    },
    relatedConcepts: [{ type: String, trim: true }],
    relatedResources: [{ type: mongoose.Schema.Types.ObjectId, ref: "Resource" }],
    prerequisites: [{ type: String, trim: true }],
    recommendedNext: {
      type: String,
      trim: true,
      maxlength: 800,
    },
    anchor: {
      type: String,
      trim: true,
      default: "",
    },
    band: {
      type: String,
      enum: ["well explored", "developing", "underexplored", "unexplored", ""],
      default: "",
    },
    coverageScore: {
      type: Number,
      default: 0,
    },
    signals: {
      resourceCount: { type: Number, default: 0 },
      conceptCount: { type: Number, default: 0 },
      graphConnections: { type: Number, default: 0 },
      recencyFactor: { type: Number, default: 0 },
      anchorResourceCount: { type: Number, default: 0 },
      anchorBand: { type: String, default: "" },
      anchorScore: { type: Number, default: 0 },
    },
    learningPath: [
      {
        name: { type: String, trim: true },
        status: { type: String, enum: ["covered", "recommended"], default: "recommended" },
      },
    ],
    confidence: {
      type: Number,
      default: 0,
      min: 0,
      max: 1,
    },
  },
  { timestamps: true }
);

knowledgeGapSchema.index({ user: 1, topic: 1 }, { unique: true });

const KnowledgeGap = mongoose.model("KnowledgeGap", knowledgeGapSchema);

module.exports = KnowledgeGap;
