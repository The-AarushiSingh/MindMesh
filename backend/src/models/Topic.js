const mongoose = require("mongoose");

const topicSchema = new mongoose.Schema(
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
    concepts: [{ type: mongoose.Schema.Types.ObjectId, ref: "Concept" }],
    relatedTopics: [{ type: mongoose.Schema.Types.ObjectId, ref: "Topic" }],
    occurrenceCount: {
      type: Number,
      default: 0,
    },
    lastSeenAt: Date,
  },
  { timestamps: true }
);

topicSchema.index({ user: 1, normalizedName: 1 }, { unique: true });

const Topic = mongoose.model("Topic", topicSchema);

module.exports = Topic;
