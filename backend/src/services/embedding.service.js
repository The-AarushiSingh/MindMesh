const { normalizeContent } = require("./content.service");
const logger = require("../utils/logger");

const STOP_WORDS = new Set([
  "a", "an", "and", "are", "about", "for", "from", "have", "how", "i", "in",
  "is", "it", "my", "of", "on", "or", "saved", "the", "this", "that", "to",
  "what", "with", "you", "your",
]);

const cosineSimilarity = (a = [], b = []) => {
  if (!a.length || !b.length || a.length !== b.length) return 0;

  let dot = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;

  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    magnitudeA += a[i] * a[i];
    magnitudeB += b[i] * b[i];
  }

  if (!magnitudeA || !magnitudeB) return 0;
  return dot / (Math.sqrt(magnitudeA) * Math.sqrt(magnitudeB));
};

const tokenize = (value = "") => {
  return normalizeContent(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token));
};

const embeddingConfigured = () => Boolean(process.env.EMBEDDING_API_KEY || process.env.AI_API_KEY);

const generateEmbedding = async (value = "") => {
  const text = normalizeContent(value);
  if (!text) return null;

  const apiKey = process.env.EMBEDDING_API_KEY || process.env.AI_API_KEY;
  if (!apiKey) return null;

  const baseUrl = process.env.EMBEDDING_BASE_URL || process.env.AI_BASE_URL || "https://api.openai.com/v1";
  const model = process.env.EMBEDDING_MODEL || "text-embedding-3-small";
  const started = Date.now();

  try {
    const response = await fetch(`${baseUrl}/embeddings`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(20000),
      body: JSON.stringify({
        model,
        input: text.slice(0, 8000),
      }),
    });

    if (!response.ok) {
      throw new Error(`Embedding provider returned ${response.status}`);
    }

    const payload = await response.json();
    const vector = payload.data?.[0]?.embedding;

    if (!Array.isArray(vector) || !vector.length) {
      throw new Error("Embedding provider returned an empty vector");
    }

    logger.info("embedding.completed", {
      model,
      durationMs: Date.now() - started,
      dimensions: vector.length,
    });

    return vector;
  } catch (error) {
    logger.warn("embedding.failed", {
      model,
      durationMs: Date.now() - started,
      message: error.message,
    });
    return null;
  }
};

const lexicalMatch = (query, resource) => {
  const queryTokens = [...new Set(tokenize(query))];
  if (!queryTokens.length) {
    return { similarity: 0, matchedTerms: [] };
  }

  const fields = {
    title: tokenize(resource.title),
    topics: tokenize((resource.topics || []).join(" ")),
    concepts: tokenize((resource.concepts || []).join(" ")),
    summary: tokenize(`${resource.summary || ""} ${resource.description || ""}`),
    content: tokenize(resource.content),
  };
  const weights = { title: 3, topics: 2.5, concepts: 2.5, summary: 1.5, content: 1 };
  const matched = [];
  let weightedHits = 0;

  queryTokens.forEach((token) => {
    let best = 0;
    Object.entries(fields).forEach(([field, tokens]) => {
      const hit = tokens.some((candidate) => candidate === token || candidate.startsWith(token) || token.startsWith(candidate));
      if (hit) best = Math.max(best, weights[field]);
    });
    if (best > 0) {
      matched.push(token);
      weightedHits += best;
    }
  });

  return {
    similarity: weightedHits / (queryTokens.length * 3),
    matchedTerms: matched,
  };
};

const searchResourcesByMeaning = async (userId, query, resources = [], limit = 5) => {
  const queryText = normalizeContent(query || "");
  if (!queryText) return [];

  const owned = resources.filter((resource) => {
    if (!userId) return true;
    if (!resource.user) return true;
    return String(resource.user) === String(userId);
  });

  const queryEmbedding = await generateEmbedding(queryText);

  if (queryEmbedding) {
    return owned
      .map((resource) => {
        const resourceEmbedding = Array.isArray(resource.embedding) ? resource.embedding : [];
        const lexical = lexicalMatch(queryText, resource);
        const similarity = cosineSimilarity(resourceEmbedding, queryEmbedding);
        return {
          ...resource,
          similarity,
          matchedTerms: lexical.matchedTerms,
          mode: "embedding",
        };
      })
      .filter((resource) => resource.similarity > 0.2)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);
  }

  return owned
    .map((resource) => {
      const lexical = lexicalMatch(queryText, resource);
      return {
        ...resource,
        similarity: lexical.similarity,
        matchedTerms: lexical.matchedTerms,
        mode: "lexical-fallback",
      };
    })
    .filter((resource) => resource.similarity > 0)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);
};

module.exports = {
  cosineSimilarity,
  generateEmbedding,
  searchResourcesByMeaning,
  lexicalMatch,
  embeddingConfigured,
};
