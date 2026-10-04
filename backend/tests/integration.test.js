const test = require("node:test");
const assert = require("node:assert/strict");

process.env.JWT_SECRET = "integration-test-secret";
process.env.JWT_EXPIRES_IN = "1h";
process.env.MONGO_URI = "mongodb://127.0.0.1:27017/mindmesh_test";
process.env.EMAIL_DELIVERY = "development";
delete process.env.AI_API_KEY;
delete process.env.EMBEDDING_API_KEY;
delete process.env.RESEND_API_KEY;

const mongoose = require("mongoose");
const app = require("../src/app");
const { whenIdle } = require("../src/services/job.service");

const request = async (baseUrl, path, { method = "GET", token, body } = {}) => {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  return { status: response.status, data };
};

test("product flow and user isolation against MongoDB", async () => {
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 4000 });
  await mongoose.connection.dropDatabase();

  const server = app.listen(0);
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const health = await request(baseUrl, "/api/health");
    assert.equal(health.status, 200);
    assert.equal(health.data.analysis, "heuristic");
    assert.equal(health.data.embeddings, "lexical-fallback");

    const password = "Archive1!test";
    const registered = await request(baseUrl, "/api/auth/register", {
      method: "POST",
      body: { name: "User A", email: "usera@example.com", password },
    });
    assert.equal(registered.status, 201);
    assert.equal(registered.data.user.emailVerified, false);
    assert.equal(registered.data.token, undefined);

    const blockedLogin = await request(baseUrl, "/api/auth/login", {
      method: "POST",
      body: { email: "usera@example.com", password },
    });
    assert.equal(blockedLogin.status, 403);
    assert.equal(blockedLogin.data.token, undefined);

    const verified = await request(baseUrl, "/api/auth/verify", {
      method: "POST",
      body: { email: "usera@example.com", code: registered.data.devCode },
    });
    assert.equal(verified.status, 200);

    const invalidLogin = await request(baseUrl, "/api/auth/login", {
      method: "POST",
      body: { email: "usera@example.com", password: "wrong-password" },
    });
    assert.equal(invalidLogin.status, 401);

    const protectedRoute = await request(baseUrl, "/api/resources");
    assert.equal(protectedRoute.status, 401);

    const loginA = await request(baseUrl, "/api/auth/login", {
      method: "POST",
      body: { email: "usera@example.com", password },
    });
    assert.equal(loginA.status, 200);
    const tokenA = loginA.data.token;

    const registeredB = await request(baseUrl, "/api/auth/register", {
      method: "POST",
      body: { name: "User B", email: "userb@example.com", password },
    });
    await request(baseUrl, "/api/auth/verify", {
      method: "POST",
      body: { email: "userb@example.com", code: registeredB.data.devCode },
    });
    const loginB = await request(baseUrl, "/api/auth/login", {
      method: "POST",
      body: { email: "userb@example.com", password },
    });
    const tokenB = loginB.data.token;

    const badUrl = await request(baseUrl, "/api/resources", {
      method: "POST",
      token: tokenA,
      body: { url: "http://127.0.0.1/private" },
    });
    assert.equal(badUrl.status, 400);

    const created = await request(baseUrl, "/api/resources", {
      method: "POST",
      token: tokenA,
      body: {
        type: "note",
        title: "A-only hybrid search notebook",
        content: "RAG combines retrieval with embeddings. Vector search and hybrid search improve retrieval. BM25 still matters for keyword matching.",
      },
    });
    assert.equal(created.status, 201);
    assert.equal(created.data.resource.status, "saved");
    assert.equal(created.data.resource.embedding, undefined);

    await whenIdle();

    const detail = await request(baseUrl, `/api/resources/${created.data.resource._id}`, { token: tokenA });
    assert.equal(detail.status, 200);
    assert.equal(detail.data.resource.status, "processed");
    assert.equal(detail.data.resource.analysisSource, "heuristic");
    assert.equal(detail.data.resource.embeddingSource, "unavailable");
    assert.ok(detail.data.resource.concepts.includes("Hybrid search"));
    assert.ok(detail.data.resource.concepts.includes("RAG"));

    const hidden = await request(baseUrl, `/api/resources/${created.data.resource._id}`, { token: tokenB });
    assert.equal(hidden.status, 404);

    const searchA = await request(baseUrl, "/api/search?q=hybrid%20search%20retrieval", { token: tokenA });
    assert.equal(searchA.status, 200);
    assert.equal(searchA.data.mode, "lexical-fallback");
    assert.equal(searchA.data.results[0].title, "A-only hybrid search notebook");
    assert.ok(searchA.data.results[0].why.includes("Keyword overlap"));

    const searchB = await request(baseUrl, "/api/search?q=hybrid%20search%20retrieval", { token: tokenB });
    assert.deepEqual(searchB.data.results, []);

    const askA = await request(baseUrl, "/api/brain/ask", {
      method: "POST",
      token: tokenA,
      body: { question: "What have I saved about hybrid search and retrieval?" },
    });
    assert.equal(askA.status, 200);
    assert.equal(askA.data.answerSource, "heuristic");
    assert.equal(askA.data.sources[0].title, "A-only hybrid search notebook");
    assert.match(askA.data.answer, /A-only hybrid search notebook/);

    const askB = await request(baseUrl, "/api/brain/ask", {
      method: "POST",
      token: tokenB,
      body: { question: "What have I saved about hybrid search and retrieval?" },
    });
    assert.equal(askB.data.insufficient, true);
    assert.equal(askB.data.sources.length, 0);
    assert.doesNotMatch(askB.data.answer, /A-only hybrid search notebook/);

    const graphA = await request(baseUrl, "/api/knowledge/graph", { token: tokenA });
    assert.ok(graphA.data.graph.concepts.some((concept) => concept.name === "Hybrid search"));

    const graphB = await request(baseUrl, "/api/knowledge/graph", { token: tokenB });
    assert.equal(graphB.data.graph.concepts.length, 0);

    const gapsA = await request(baseUrl, "/api/knowledge/gaps", { token: tokenA });
    assert.ok(gapsA.data.gaps.length > 0);
    assert.ok(gapsA.data.gaps.some((gap) => gap.topic === "Reranking" || gap.topic === "Chunking"));
    assert.match(gapsA.data.gaps[0].why, /saved resource/);

    const gapsB = await request(baseUrl, "/api/knowledge/gaps", { token: tokenB });
    assert.deepEqual(gapsB.data.gaps, []);

    const failed = await request(baseUrl, "/api/resources", {
      method: "POST",
      token: tokenA,
      body: { url: "http://127.0.0.1:9/does-not-exist" },
    });
    assert.equal(failed.status, 400);

    const blockedFetch = await request(baseUrl, "/api/resources", {
      method: "POST",
      token: tokenA,
      body: { url: "https://example.invalid/mindmesh-missing" },
    });
    assert.equal(blockedFetch.status, 201);
    await whenIdle();
    const failedDetail = await request(baseUrl, `/api/resources/${blockedFetch.data.resource._id}`, { token: tokenA });
    assert.equal(failedDetail.data.resource.status, "failed");
    assert.ok(failedDetail.data.resource.error);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});
