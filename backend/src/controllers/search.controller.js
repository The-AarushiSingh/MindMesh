const { getRelevantResources } = require("../services/knowledge.service");

const searchResources = async (req, res) => {
  try {
    const query = typeof req.query.q === "string" ? req.query.q.trim() : "";

    if (!query) {
      return res.status(400).json({ message: "A search query is required" });
    }

    const resources = await getRelevantResources(req.user._id, query, 10);

    return res.status(200).json({
      query,
      total: resources.length,
      results: resources.map((resource) => ({
        id: resource._id,
        title: resource.title || "Untitled resource",
        url: resource.url,
        summary: resource.summary || resource.description,
        type: resource.type,
        status: resource.status,
        score: resource.score,
        topics: resource.topics || [],
        concepts: resource.concepts || [],
      })),
    });
  } catch (error) {
    console.error("Search error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

module.exports = {
  searchResources,
};