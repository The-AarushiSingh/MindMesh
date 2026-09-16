const Resource = require("../models/Resource");

const normalizeQuery = (value = "") => {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
};

const scoreResourceMatch = (resource, queryTokens) => {
  if (!queryTokens.length) {
    return 0;
  }

  const haystack = [
    resource.title || "",
    resource.description || "",
    resource.summary || "",
    resource.content || "",
    resource.url || "",
    (resource.topics || []).join(" "),
    (resource.concepts || []).join(" "),
  ]
    .join(" ")
    .toLowerCase();

  let score = 0;

  queryTokens.forEach((token) => {
    if (haystack.includes(token)) {
      score += 2;
    }

    const title = (resource.title || "").toLowerCase();
    if (title.includes(token)) {
      score += 3;
    }
  });

  return score;
};

const getRelevantResources = async (userId, query = "", limit = 10) => {
  const queryTokens = normalizeQuery(query);
  const resources = await Resource.find({ user: userId }).sort({ createdAt: -1 }).lean();

  const rankedResources = resources
    .map((resource) => ({
      ...resource,
      score: scoreResourceMatch(resource, queryTokens),
    }))
    .filter((resource) => queryTokens.length === 0 || resource.score > 0)
    .sort((a, b) => b.score - a.score || new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, limit);

  return rankedResources;
};

const buildKnowledgeOverview = async (userId) => {
  const resources = await Resource.find({ user: userId }).sort({ createdAt: -1 }).lean();

  const topics = {};
  resources.forEach((resource) => {
    (resource.topics || []).forEach((topic) => {
      const safeTopic = topic.toLowerCase();
      topics[safeTopic] = (topics[safeTopic] || 0) + 1;
    });
  });

  const topTopics = Object.entries(topics)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, count]) => ({ name, count }));

  return {
    totalResources: resources.length,
    processedResources: resources.filter((resource) => resource.status === "processed").length,
    failedResources: resources.filter((resource) => resource.status === "failed").length,
    topTopics,
    recentResources: resources.slice(0, 5),
  };
};

module.exports = {
  normalizeQuery,
  scoreResourceMatch,
  getRelevantResources,
  buildKnowledgeOverview,
};
