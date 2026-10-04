const { buildAnswerFromContext } = require("../services/ai.service");
const { searchUserKnowledge } = require("../services/embedding.service");
const logger = require("../utils/logger");

const MIN_SIMILARITY = {
  embedding: 0.2,
  "lexical-fallback": 0.12,
};

const askBrain = async (req, res) => {
  try {
    const question = typeof req.body?.question === "string" ? req.body.question.trim() : "";

    if (!question) {
      return res.status(400).json({ message: "A question is required" });
    }

    if (question.length > 1000) {
      return res.status(400).json({ message: "Question is too long" });
    }

    const retrieval = await searchUserKnowledge(req.user._id, question, {
      limit: 5,
      perResource: 2,
      minSimilarity: MIN_SIMILARITY.embedding,
    });
    const mode = retrieval.mode;
    const threshold = mode === "embedding" ? MIN_SIMILARITY.embedding : MIN_SIMILARITY["lexical-fallback"];
    const relevant = retrieval.hits.filter((resource) => resource.similarity >= threshold);
    const response = await buildAnswerFromContext(question, relevant);

    return res.status(200).json({
      question,
      answer: response.answer,
      sources: response.sources,
      mode,
      retrievalMode: response.retrievalMode || mode,
      answerSource: response.answerSource || "heuristic",
      insufficient: Boolean(response.insufficient),
      grounded: Boolean(response.grounded),
      missingConcepts: response.missingConcepts || [],
      evidenceCount: relevant.length,
    });
  } catch (error) {
    logger.error("brain.ask_failed", { message: error.message });
    return res.status(500).json({ message: "Internal server error" });
  }
};

module.exports = {
  askBrain,
};
