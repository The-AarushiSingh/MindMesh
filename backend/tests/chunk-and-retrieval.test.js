const test = require("node:test");
const assert = require("node:assert/strict");

const { chunkText } = require("../src/services/chunk.service");
const { matchConcepts } = require("../src/services/vocabulary");
const { cosineSimilarity, rankEmbeddedChunks } = require("../src/services/embedding.service");

test("chunking is deterministic and keeps overlap for long text", () => {
  const sentence = "Hybrid search combines BM25 lexical retrieval with vector similarity. ";
  const text = sentence.repeat(40);
  const first = chunkText(text, { maxChars: 200, overlap: 40 });
  const second = chunkText(text, { maxChars: 200, overlap: 40 });

  assert.ok(first.length > 1);
  assert.deepEqual(first, second);
  assert.equal(first[0].index, 0);
  assert.ok(first[1].text.includes(first[0].text.slice(-20).trim().slice(0, 12)));
  assert.equal(chunkText("   ").length, 0);
});

test("semantic ranking uses cosine similarity and keeps one hit per resource", () => {
  const hybrid = [1, 0, 0];
  const unrelated = [0, 1, 0];
  const query = [0.96, 0.04, 0];

  assert.ok(cosineSimilarity(query, hybrid) > cosineSimilarity(query, unrelated));

  const hits = rankEmbeddedChunks([
    { resource: "hybrid", index: 0, text: "Hybrid search combines BM25 lexical retrieval with vector similarity.", embedding: hybrid },
    { resource: "hybrid", index: 1, text: "A second passage from the same note.", embedding: hybrid },
    { resource: "other", index: 0, text: "Quantum chemistry studies electron structure.", embedding: unrelated },
  ], query, { limit: 5, perResource: 1, minSimilarity: 0.32 });

  assert.equal(hits.length, 1);
  assert.equal(String(hits[0].resourceId), "hybrid");
  assert.equal(hits[0].mode, "embedding");
  assert.ok(hits[0].similarity >= 0.32);
});

test("negated concept mentions are not treated as coverage", () => {
  const denied = matchConcepts("This note does not cover agent memory or observability.");
  const names = denied.map((concept) => concept.normalizedName);
  assert.equal(names.includes("agent memory"), false);
  assert.equal(names.includes("observability"), false);

  const covered = matchConcepts("Agents can use agent memory.");
  assert.ok(covered.some((concept) => concept.normalizedName === "agent memory"));
});

test("semantic ranking returns nothing below the similarity threshold", () => {
  const hits = rankEmbeddedChunks([
    { resource: "other", index: 0, text: "Unrelated", embedding: [0, 1, 0] },
  ], [1, 0, 0], { limit: 5, perResource: 1, minSimilarity: 0.32 });

  assert.deepEqual(hits, []);
});
