const mongoose = require("mongoose");

const chunkSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    resource: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Resource",
      required: true,
      index: true,
    },
    index: {
      type: Number,
      required: true,
      min: 0,
    },
    text: {
      type: String,
      required: true,
    },
    embedding: {
      type: [Number],
      select: false,
      default: undefined,
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
    dimensions: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

chunkSchema.index({ user: 1, resource: 1, index: 1 }, { unique: true });

const Chunk = mongoose.model("Chunk", chunkSchema);

module.exports = Chunk;
