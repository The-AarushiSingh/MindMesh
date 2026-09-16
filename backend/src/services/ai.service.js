const { normalizeContent } = require("./content.service");

const tokenize = (value = "") => {
  return normalizeContent(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
};

const dedupe = (items = []) => {
  return [...new Set(items.filter(Boolean).map((item) => item.trim()).filter(Boolean))];
};

const inferTopics = (content = "") => {
  const tokens = tokenize(content);
  const counts = {};

  tokens.forEach((token) => {
    if (token.length < 5) return;
    counts[token] = (counts[token] || 0) + 1;
  });

  return dedupe(
    Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([token]) => token)
  );
};

const inferConcepts = (content = "") => {
  const normalized = normalizeContent(content);
  const references = [
    "retrieval",
    "rag",
    "embedding",
    "search",
    "vector",
    "llm",
    "knowledge",
    "graph",
    "prompt",
    "model",
    "index",
    "context",
  ];

  return dedupe(
    references.filter((reference) => normalized.toLowerCase().includes(reference.toLowerCase()))
  );
};

const inferSummary = (content = "") => {
  const normalized = normalizeContent(content);
  if (!normalized) return "No summary available yet.";

  const sentences = normalized.split(/(?<=[.!?])\s+/).filter(Boolean);
  const summary = sentences.slice(0, 2).join(" ");

  return summary.length > 220 ? `${summary.slice(0, 217).trim()}...` : summary;
};

const inferDifficulty = (content = "") => {
  const words = tokenize(content);
  const technicalWeight = words.filter((word) => ["vector", "retrieval", "embedding", "model", "graph", "index", "context"].includes(word)).length;

  if (technicalWeight >= 4) return "advanced";
  if (technicalWeight >= 2) return "intermediate";
  return "beginner";
};

const inferPrerequisites = (content = "") => {
  const normalized = normalizeContent(content).toLowerCase();
  const prerequisites = [];

  if (normalized.includes("vector")) prerequisites.push("Vectors and embeddings");
  if (normalized.includes("retrieval")) prerequisites.push("Retrieval fundamentals");
  if (normalized.includes("model")) prerequisites.push("Large language model basics");
  if (normalized.includes("graph")) prerequisites.push("Knowledge graph concepts");

  return dedupe(prerequisites);
};

const analyzeResourceContent = (content = "") => {
  const normalized = normalizeContent(content);

  if (!normalized) {
    return {
      summary: "No readable resource content was found.",
      topics: [],
      concepts: [],
      keyIdeas: [],
      difficulty: "beginner",
      prerequisites: [],
    };
  }

  const words = tokenize(content);
  const keyIdeas = dedupe(
    words
      .filter((word) => word.length > 5)
      .slice(0, 8)
  );

  return {
    summary: inferSummary(normalized),
    topics: inferTopics(normalized),
    concepts: inferConcepts(normalized),
    keyIdeas,
    difficulty: inferDifficulty(normalized),
    prerequisites: inferPrerequisites(normalized),
  };
};

const buildAnswerFromContext = (question, resources = []) => {
  if (!resources.length) {
    return {
      answer:
        "I could not find enough relevant material in your personal knowledge base to answer that question confidently.",
      sources: [],
    };
  }

  const sourceFragments = resources
    .slice(0, 3)
    .map((resource) => `${resource.title}: ${resource.summary || resource.description || "No summary available."}`)
    .join("\n");

  const answer = [
    `Based on your saved knowledge, the most relevant material suggests that ${question.trim()}.`,
    "",
    `This is grounded in the following saved resources:\n${sourceFragments}`,
  ].join(" ");

  return {
    answer,
    sources: resources.map((resource) => ({
      id: resource._id,
      title: resource.title,
      url: resource.url,
      summary: resource.summary || resource.description,
    })),
  };
};

module.exports = {
  analyzeResourceContent,
  buildAnswerFromContext,
  inferTopics,
  inferConcepts,
  inferSummary,
  inferDifficulty,
  inferPrerequisites,
};
