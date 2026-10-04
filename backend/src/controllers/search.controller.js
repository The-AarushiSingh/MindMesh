const Resource = require("../models/Resource");
const { searchResourcesByMeaning, embeddingConfigured } = require("../services/embedding.service");
const logger = require("../utils/logger");

const searchResources = async (req, res) => {
  try {
    const query = typeof req.query.q === "string" ? req.query.q.trim() : "";

    if (!query) {
      return res.status(400).json({ message: "A search query is required" });
    }

    if (query.length > 300) {
      return res.status(400).json({ message: "Search query is too long" });
    }

    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 20);
    const selection = embeddingConfigured() ? "+embedding" : "-embedding";
    const resources = await Resource.find({ user: req.user._id, status: "processed" })
      .select(selection)
      .lean();

    const rankedResources = await searchResourcesByMeaning(req.user._id, query, resources, limit);
    const mode = rankedResources[0]?.mode || (embeddingConfigured() ? "embedding" : "lexical-fallback");

    return res.status(200).json({
      query,
      total: rankedResources.length,
      mode,
      results: rankedResources.map((resource) => ({
        id: resource._id,
        title: resource.title || "Untitled resource",
        url: resource.url || "",
        summary: resource.summary || resource.description || "",
        type: resource.type,
        status: resource.status,
        score: Math.round((resource.similarity || 0) * 1000) / 1000,
        topics: resource.topics || [],
        concepts: resource.concepts || [],
        mode: resource.mode,
        matchedTerms: resource.matchedTerms || [],
        why: resource.mode === "embedding"
          ? "Ranked by semantic similarity to your saved resource."
          : resource.matchedTerms?.length
            ? `Keyword overlap on ${resource.matchedTerms.join(", ")}.`
            : "Keyword overlap with the saved resource.",
      })),
    });
  } catch (error) {
    logger.error("search.failed", { message: error.message });
    return res.status(500).json({ message: "Internal server error" });
  }
};

module.exports = {
  searchResources,
};
