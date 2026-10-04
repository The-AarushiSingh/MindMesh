const test = require("node:test");
const assert = require("node:assert/strict");

const {
  coverageScore,
  classifyCoverage,
  buildGapRecommendations,
} = require("../src/services/knowledge.service");

const now = new Date("2026-10-04T00:00:00Z");

test("coverage score is deterministic and classifies depth from stored counts", () => {
  const strong = {
    resourceCount: 4,
    conceptCount: 6,
    graphConnections: 6,
    lastActivity: now,
  };

  assert.equal(coverageScore(strong, now), 1);
  assert.equal(classifyCoverage(1, 4), "well explored");

  const thin = coverageScore({
    resourceCount: 1,
    conceptCount: 1,
    graphConnections: 0,
    lastActivity: new Date("2020-01-01T00:00:00Z"),
  }, now);

  assert.equal(thin, 0.163);
  assert.equal(classifyCoverage(thin, 1), "underexplored");
  assert.equal(classifyCoverage(0, 0), "unexplored");
  assert.equal(coverageScore(strong, now), coverageScore(strong, now));
});

test("gaps explain missing neighbors of covered concepts and stay empty without data", () => {
  const entities = [
    { name: "RAG", normalizedName: "rag", resourceCount: 4, conceptCount: 4, graphConnections: 3, lastActivity: now },
    { name: "Embeddings", normalizedName: "embeddings", resourceCount: 4, conceptCount: 3, graphConnections: 2, lastActivity: now },
    { name: "Vector search", normalizedName: "vector search", resourceCount: 3, conceptCount: 3, graphConnections: 2, lastActivity: now },
    { name: "Hybrid search", normalizedName: "hybrid search", resourceCount: 3, conceptCount: 3, graphConnections: 2, lastActivity: now },
  ];

  const gaps = buildGapRecommendations(entities, now);
  const reranking = gaps.find((gap) => gap.topic === "Reranking");

  assert.ok(reranking);
  assert.match(reranking.why, /saved resource/);
  assert.match(reranking.recommendedNext, /recommendation/);
  assert.equal(reranking.band, "unexplored");
  assert.ok(reranking.learningPath.some((step) => step.status === "covered"));
  assert.ok(reranking.learningPath.some((step) => step.name === "Reranking" && step.status === "recommended"));
  assert.deepEqual(buildGapRecommendations(entities, now), gaps);
  assert.deepEqual(buildGapRecommendations([], now), []);
});
