const { getRelevantResources, buildKnowledgeOverview } = require("../services/knowledge.service");
const { buildAnswerFromContext } = require("../services/ai.service");

const askBrain = async (req, res) => {
  try {
    const question = typeof req.body?.question === "string" ? req.body.question.trim() : "";

    if (!question) {
      return res.status(400).json({ message: "A question is required" });
    }

    const resources = await getRelevantResources(req.user._id, question, 5);
    const response = buildAnswerFromContext(question, resources);
    const overview = await buildKnowledgeOverview(req.user._id);

    return res.status(200).json({
      question,
      answer: response.answer,
      sources: response.sources,
      overview,
    });
  } catch (error) {
    console.error("Ask brain error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

module.exports = {
  askBrain,
};