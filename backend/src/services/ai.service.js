const { normalizeContent } = require("./content.service");
const { matchConcepts, displayName } = require("./vocabulary");
const logger = require("../utils/logger");

const STOP_WORDS = new Set([
  "about", "after", "again", "their", "there", "these", "those", "which", "while",
  "would", "could", "should", "where", "what", "when", "with", "from", "this",
  "that", "have", "your", "into", "than", "then", "them", "they", "been", "were",
  "will", "just", "also", "more", "some", "such", "only", "other", "over",
]);

const tokenize = (value = "") => {
  return normalizeContent(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
};

const dedupe = (items = []) => {
  const seen = new Set();
  const result = [];

  items.forEach((item) => {
    const text = String(item || "").trim();
    const key = text.toLowerCase();
    if (!text || seen.has(key)) return;
    seen.add(key);
    result.push(text);
  });

  return result;
};

const inferTopics = (content = "") => {
  const phrases = matchConcepts(content).map((concept) => concept.name);
  const tokens = tokenize(content);
  const counts = {};

  tokens.forEach((token) => {
    if (token.length < 5 || STOP_WORDS.has(token)) return;
    counts[token] = (counts[token] || 0) + 1;
  });

  const frequent = Object.entries(counts)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 5)
    .map(([token]) => token);

  return dedupe([...phrases, ...frequent]).slice(0, 8);
};

const inferConcepts = (content = "") => {
  return matchConcepts(content).map((concept) => concept.name);
};

const inferSummary = (content = "") => {
  const normalized = normalizeContent(content);
  if (!normalized) return "No summary available yet.";

  const sentences = normalized.split(/(?<=[.!?])\s+/).filter(Boolean);
  const summary = sentences.slice(0, 2).join(" ");

  return summary.length > 320 ? `${summary.slice(0, 317).trim()}...` : summary;
};

const inferDifficulty = (content = "") => {
  const words = tokenize(content);
  const markers = new Set(["vector", "retrieval", "embedding", "embeddings", "model", "graph", "reranking", "agent", "evaluation"]);
  const technicalWeight = words.filter((word) => markers.has(word)).length;

  if (technicalWeight >= 4) return "advanced";
  if (technicalWeight >= 2) return "intermediate";
  return "beginner";
};

const inferPrerequisites = (content = "") => {
  const matched = matchConcepts(content).map((concept) => concept.normalizedName);
  const prerequisites = [];

  if (matched.includes("embeddings") || matched.includes("vector search")) {
    prerequisites.push("Vectors and embeddings");
  }
  if (matched.includes("retrieval") || matched.includes("rag")) {
    prerequisites.push("Retrieval fundamentals");
  }
  if (matched.includes("agents") || matched.includes("tool calling")) {
    prerequisites.push("LLM application basics");
  }
  if (matched.includes("knowledge graph")) {
    prerequisites.push("Knowledge graph concepts");
  }
  if (matched.includes("reranking") || matched.includes("evaluation")) {
    prerequisites.push("Ranking and evaluation");
  }

  return dedupe(prerequisites);
};

const cleanStringList = (value, limit) => {
  if (!Array.isArray(value)) return [];

  return dedupe(
    value
      .filter((item) => typeof item === "string")
      .map((item) => item.trim())
      .filter((item) => item.length > 0 && item.length <= 80)
  ).slice(0, limit);
};

const normalizeRelationships = (value) => {
  if (!Array.isArray(value)) return [];

  return dedupe(
    value.slice(0, 12).map((item) => {
      if (typeof item === "string") return item.trim().slice(0, 160);
      if (!item || typeof item !== "object") return "";

      const from = String(item.from || item.source || "").trim();
      const to = String(item.to || item.target || "").trim();
      const type = String(item.type || item.relation || "related_to").trim();
      if (!from || !to) return "";
      return `${from} -> ${to} (${type})`.slice(0, 160);
    })
  ).filter(Boolean);
};

const validateAnalysis = (analysis) => {
  const summary = typeof analysis?.summary === "string" && analysis.summary.trim()
    ? analysis.summary.trim().slice(0, 1000)
    : "Summary unavailable.";

  return {
    summary,
    topics: cleanStringList(analysis?.topics, 8),
    concepts: cleanStringList(analysis?.concepts, 12),
    keyIdeas: cleanStringList(analysis?.keyIdeas, 8),
    difficulty: ["beginner", "intermediate", "advanced"].includes(analysis?.difficulty)
      ? analysis.difficulty
      : "beginner",
    prerequisites: cleanStringList(analysis?.prerequisites, 8),
    relationships: normalizeRelationships(analysis?.relationships),
    analysisSource: analysis?.analysisSource === "provider" ? "provider" : "heuristic",
  };
};

const interpretProviderPayload = (payload) => {
  const message = payload?.choices?.[0]?.message?.content;
  if (!message || typeof message !== "string") {
    throw new Error("AI provider returned no content");
  }

  let parsed;
  try {
    parsed = JSON.parse(message);
  } catch {
    throw new Error("AI provider returned invalid JSON");
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("AI provider returned malformed analysis");
  }

  const validated = validateAnalysis({ ...parsed, analysisSource: "provider" });
  const hasSummary = typeof parsed.summary === "string" && parsed.summary.trim().length > 0;
  const hasStructure = validated.topics.length > 0 || validated.concepts.length > 0;

  if (!hasSummary && !hasStructure) {
    throw new Error("AI provider returned an empty analysis");
  }

  return validated;
};

const heuristicAnalysis = (content) => {
  const words = tokenize(content);
  const keyIdeas = dedupe(words.filter((word) => word.length > 5 && !STOP_WORDS.has(word))).slice(0, 8);

  return {
    ...validateAnalysis({
      summary: inferSummary(content),
      topics: inferTopics(content),
      concepts: inferConcepts(content),
      keyIdeas,
      difficulty: inferDifficulty(content),
      prerequisites: inferPrerequisites(content),
      relationships: [],
      analysisSource: "heuristic",
    }),
    analysisSource: "heuristic",
    providerModel: "",
  };
};

const analyzeResourceContent = async (content = "") => {
  const normalized = normalizeContent(content);
  const empty = {
    summary: "No readable resource content was found.",
    topics: [],
    concepts: [],
    keyIdeas: [],
    difficulty: "beginner",
    prerequisites: [],
    relationships: [],
    analysisSource: "unavailable",
    providerModel: "",
  };

  if (!normalized) {
    return empty;
  }

  const apiKey = process.env.AI_API_KEY;
  if (!apiKey) {
    return heuristicAnalysis(normalized);
  }

  const baseUrl = process.env.AI_BASE_URL || "https://api.openai.com/v1";
  const model = process.env.AI_MODEL || "gpt-4o-mini";
  const started = Date.now();

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(25000),
      body: JSON.stringify({
        model,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: "You analyze a saved resource for a personal knowledge archive. Return JSON with string fields summary and difficulty (beginner, intermediate, or advanced), and arrays of short strings: topics, concepts, keyIdeas, prerequisites, relationships. Relationships may be strings or objects with from, to, and type. Use only ideas supported by the content.",
          },
          {
            role: "user",
            content: `Analyze this resource and return JSON only:\n${normalized.slice(0, 12000)}`,
          },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`AI provider returned ${response.status}`);
    }

    const payload = await response.json();
    const validated = interpretProviderPayload(payload);

    logger.info("ai.analysis.completed", {
      model,
      durationMs: Date.now() - started,
      analysisSource: "provider",
    });

    return {
      ...validated,
      analysisSource: "provider",
      providerModel: model,
    };
  } catch (error) {
    logger.warn("ai.analysis.failed", {
      model,
      durationMs: Date.now() - started,
      message: error.message,
      fallback: "heuristic",
    });
    return heuristicAnalysis(normalized);
  }
};

const toSource = (resource) => ({
  resourceId: resource._id,
  id: resource._id,
  title: resource.title,
  url: resource.url || "",
  summary: resource.summary || resource.description || "",
});

const missingConcepts = (question, resources) => {
  const asked = matchConcepts(question).map((concept) => concept.normalizedName);
  const covered = new Set();

  resources.forEach((resource) => {
    const blob = [
      resource.title,
      resource.summary,
      resource.content,
      ...(resource.concepts || []),
      ...(resource.topics || []),
    ].join(" ");

    matchConcepts(blob).forEach((concept) => covered.add(concept.normalizedName));
  });

  return asked.filter((concept) => !covered.has(concept)).map((concept) => displayName(concept));
};

const buildGroundedAnswer = (question, resources = []) => {
  if (!resources.length) {
    return {
      answer: "I could not find enough information in your saved knowledge base to answer that question confidently. There is not enough information to answer this from your archive.",
      sources: [],
      retrievalMode: "none",
      answerSource: "heuristic",
      insufficient: true,
      grounded: false,
      missingConcepts: matchConcepts(question).map((concept) => concept.name),
    };
  }

  const relevant = resources.slice(0, 3);
  const missing = missingConcepts(question, relevant);
  const evidence = relevant
    .map((resource) => `${resource.title}: ${resource.summary || resource.description || "No summary available."}`)
    .join(" ");

  const coverageNote = missing.length
    ? `I found ${relevant.length} saved resource${relevant.length === 1 ? "" : "s"} related to this question, but your saved knowledge does not contain enough information about ${missing.join(", ")} to give a grounded answer on that part.`
    : `I found ${relevant.length} saved resource${relevant.length === 1 ? "" : "s"} related to this question.`;

  const answer = [
    coverageNote,
    "This response quotes your archive and was not written by an AI model.",
    evidence,
  ].join(" ");

  return {
    answer,
    sources: relevant.map(toSource),
    retrievalMode: resources[0]?.mode || "lexical-fallback",
    answerSource: "heuristic",
    insufficient: missing.length > 0,
    grounded: missing.length === 0,
    missingConcepts: missing,
  };
};

const verifySources = (parsedSources, resources) => {
  const byId = new Map(resources.map((resource) => [String(resource._id), resource]));
  const verified = [];

  (Array.isArray(parsedSources) ? parsedSources : []).forEach((source) => {
    const id = String(source?.resourceId || source?.id || "");
    const resource = byId.get(id);
    if (!resource) return;
    if (verified.some((item) => String(item.resourceId) === String(resource._id))) return;
    verified.push(toSource(resource));
  });

  return verified;
};

const generateGroundedLLMAnswer = async (question, resources = []) => {
  if (!resources.length) {
    return buildGroundedAnswer(question, resources);
  }

  const apiKey = process.env.AI_API_KEY;
  if (!apiKey) {
    return buildGroundedAnswer(question, resources);
  }

  const baseUrl = process.env.AI_BASE_URL || "https://api.openai.com/v1";
  const model = process.env.AI_MODEL || "gpt-4o-mini";
  const retrievalMode = resources[0]?.mode || "embedding";
  const contextText = resources.slice(0, 5).map((resource) => {
    return [
      `resourceId: ${resource._id}`,
      `Title: ${resource.title}`,
      `URL: ${resource.url || ""}`,
      `Summary: ${resource.summary || resource.description || "No summary"}`,
      `Content: ${(resource.content || "").slice(0, 1800)}`,
    ].join("\n");
  }).join("\n\n");

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(25000),
      body: JSON.stringify({
        model,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: "Answer only from the user's saved resources. Return JSON with answer (string), insufficient (boolean), and sources (array of objects with resourceId). If the context does not support the question, set insufficient to true and explain what is missing. Do not add outside knowledge.",
          },
          {
            role: "user",
            content: `Question: ${question}\n\nSaved knowledge:\n${contextText}`,
          },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`LLM provider returned ${response.status}`);
    }

    const payload = await response.json();
    const message = payload.choices?.[0]?.message?.content;
    if (!message) {
      throw new Error("LLM provider returned no content");
    }

    const parsed = JSON.parse(message);
    const answer = typeof parsed.answer === "string" && parsed.answer.trim()
      ? parsed.answer.trim()
      : "I could not find enough information in your saved knowledge base to answer that question confidently. There is not enough information to answer this from your archive.";
    const insufficient = parsed.insufficient === true || /not enough information/i.test(answer);
    const sources = insufficient ? [] : verifySources(parsed.sources, resources);
    const groundedSources = sources.length ? sources : (insufficient ? [] : resources.slice(0, 3).map(toSource));

    return {
      answer,
      sources: groundedSources,
      retrievalMode,
      answerSource: "provider",
      insufficient,
      grounded: !insufficient && groundedSources.length > 0,
      missingConcepts: missingConcepts(question, resources),
      providerModel: model,
    };
  } catch (error) {
    logger.warn("ai.answer.failed", {
      model,
      message: error.message,
      fallback: "heuristic",
    });
    return buildGroundedAnswer(question, resources);
  }
};

const buildAnswerFromContext = async (question, resources = []) => {
  return generateGroundedLLMAnswer(question, resources);
};

module.exports = {
  analyzeResourceContent,
  buildAnswerFromContext,
  buildGroundedAnswer,
  inferTopics,
  inferConcepts,
  inferSummary,
  inferDifficulty,
  inferPrerequisites,
  validateAnalysis,
  interpretProviderPayload,
  generateGroundedLLMAnswer,
  verifySources,
};
