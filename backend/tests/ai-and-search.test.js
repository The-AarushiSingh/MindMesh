const test = require("node:test");
const assert = require("node:assert/strict");

const { analyzeResourceContent, interpretProviderPayload, verifySources } = require("../src/services/ai.service");
const { searchResourcesByMeaning } = require("../src/services/embedding.service");
const { assertFetchableUrl } = require("../src/services/content.service");

const sampleResources = [
  {
    _id: "res-1",
    user: "user-1",
    title: "Retrieval-Augmented Generation",
    summary: "A guide to preserving context with retrieval systems for LLM applications.",
    content: "Retrieval augmented generation uses external knowledge to improve LLM answers.",
    topics: ["Retrieval", "RAG"],
    concepts: ["RAG", "Retrieval"],
  },
  {
    _id: "res-2",
    user: "user-1",
    title: "Knowledge Graph Basics",
    summary: "An overview of graph structures and relationship mapping.",
    content: "Knowledge graphs connect concepts and relationships for structured memory.",
    topics: ["Knowledge graph"],
    concepts: ["Knowledge graph"],
  },
];

test("provider analysis accepts valid JSON and rejects malformed output", () => {
  const valid = interpretProviderPayload({
    choices: [{
      message: {
        content: JSON.stringify({
          summary: "Hybrid search combines keyword and vector retrieval.",
          topics: ["Search"],
          concepts: ["Hybrid search"],
          difficulty: "intermediate",
        }),
      },
    }],
  });

  assert.equal(valid.analysisSource, "provider");
  assert.equal(valid.summary, "Hybrid search combines keyword and vector retrieval.");

  assert.throws(
    () => interpretProviderPayload({ choices: [{ message: { content: "{not json" } }] }),
    /invalid JSON/
  );
  assert.throws(
    () => interpretProviderPayload({ choices: [{ message: { content: JSON.stringify({ summary: 12 }) } }] }),
    /malformed|empty/i
  );
});

test("provider failure falls back to heuristic analysis and does not claim a model wrote it", async () => {
  const originalFetch = global.fetch;
  process.env.AI_API_KEY = "test-key";
  global.fetch = async () => {
    throw new Error("timeout");
  };

  try {
    const analysis = await analyzeResourceContent(
      "Retrieval augmented generation uses embeddings, vector search, and hybrid search."
    );

    assert.equal(analysis.analysisSource, "heuristic");
    assert.equal(analysis.providerModel, "");
    assert.ok(analysis.concepts.includes("RAG"));
    assert.ok(analysis.concepts.includes("Hybrid search"));
  } finally {
    global.fetch = originalFetch;
    delete process.env.AI_API_KEY;
  }
});

test("embedding provider failure keeps retrieval in lexical mode", async () => {
  const originalFetch = global.fetch;
  process.env.EMBEDDING_API_KEY = "test-key";
  global.fetch = async () => ({ ok: false, status: 503 });

  try {
    const results = await searchResourcesByMeaning("user-1", "retrieval augmented generation", sampleResources, 5);
    assert.equal(results[0].mode, "lexical-fallback");
    assert.equal(results[0].title, "Retrieval-Augmented Generation");
    assert.ok(results[0].matchedTerms.includes("retrieval"));
  } finally {
    global.fetch = originalFetch;
    delete process.env.EMBEDDING_API_KEY;
  }
});

test("search ignores another user's resources when ownership is present", async () => {
  const results = await searchResourcesByMeaning("user-2", "retrieval augmented generation", sampleResources, 5);
  assert.deepEqual(results, []);
});

test("verified answer sources must belong to the retrieved set", () => {
  const sources = verifySources([
    { resourceId: "res-1", title: "Wrong title" },
    { resourceId: "missing", title: "Invented source" },
  ], sampleResources);

  assert.equal(sources.length, 1);
  assert.equal(sources[0].title, "Retrieval-Augmented Generation");
});

test("private and invalid URLs are rejected before fetch", () => {
  assert.throws(() => assertFetchableUrl("http://127.0.0.1/secret"), /private or local/);
  assert.throws(() => assertFetchableUrl("http://192.168.0.8/admin"), /private or local/);
  assert.throws(() => assertFetchableUrl("not a url"), /valid URL/);
});
