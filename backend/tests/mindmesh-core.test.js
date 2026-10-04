const test = require("node:test");
const assert = require("node:assert/strict");

const { validateAnalysis, buildGroundedAnswer } = require("../src/services/ai.service");
const { searchResourcesByMeaning } = require("../src/services/embedding.service");

const sampleResources = [
  {
    _id: "res-1",
    title: "Retrieval-Augmented Generation",
    summary: "A guide to preserving context with retrieval systems for LLM applications.",
    description: "This article explains retrieval and grounding.",
    content: "Retrieval augmented generation uses external knowledge to improve LLM answers.",
    topics: ["retrieval", "llms"],
    concepts: ["rag", "grounding"],
  },
  {
    _id: "res-2",
    title: "Knowledge Graph Basics",
    summary: "An overview of graph structures and relationship mapping.",
    description: "Shows how concept relationships are modeled.",
    content: "Knowledge graphs connect concepts and relationships for structured memory.",
    topics: ["knowledge graph"],
    concepts: ["graph", "relationships"],
  },
];

test("validateAnalysis preserves structured AI output with source metadata", () => {
  const analysis = validateAnalysis({
    summary: "A clear summary.",
    topics: ["retrieval"],
    concepts: ["rag"],
    keyIdeas: ["grounding"],
    difficulty: "intermediate",
    prerequisites: ["vectors"],
    relationships: ["retrieval -> grounding"],
  });

  assert.equal(analysis.summary, "A clear summary.");
  assert.deepEqual(analysis.topics, ["retrieval"]);
  assert.equal(analysis.analysisSource, "heuristic");
  assert.deepEqual(analysis.relationships, ["retrieval -> grounding"]);
});

test("searchResourcesByMeaning falls back to lexical mode when no embedding provider is configured", async () => {
  const results = await searchResourcesByMeaning("user-1", "grounded retrieval for llms", sampleResources, 5);

  assert.equal(results[0].mode, "lexical-fallback");
  assert.ok(results[0].similarity >= 0);
});

test("buildGroundedAnswer reports insufficient knowledge when no relevant context matches", () => {
  const result = buildGroundedAnswer("How do I configure a Kubernetes cluster?", []);

  assert.equal(result.answer.includes("not enough information"), true);
  assert.deepEqual(result.sources, []);
});

test("buildGroundedAnswer returns grounded sources from the user archive", () => {
  const result = buildGroundedAnswer("How does retrieval help LLM answers?", sampleResources);

  assert.ok(result.answer.length > 0);
  assert.equal(result.sources.length > 0, true);
  assert.equal(result.sources[0].title, "Retrieval-Augmented Generation");
});
