require("dotenv").config();
const mongoose = require("mongoose");
const Chunk = require("../src/models/Chunk");
const Resource = require("../src/models/Resource");
const Topic = require("../src/models/Topic");
const Concept = require("../src/models/Concept");
const KnowledgeGap = require("../src/models/KnowledgeGap");

const base = "http://127.0.0.1:5000/api";
const stamp = Date.now();
const email = `loop.${stamp}@example.com`;
const password = "Archive1!test";

const request = async (path, { method = "GET", token, body } = {}) => {
  const response = await fetch(`${base}${path}`, {
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

const waitProcessed = async (id, token) => {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const detail = await request(`/resources/${id}`, { token });
    const status = detail.data.resource?.status;
    if (status === "processed" || status === "failed") return detail.data.resource;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`resource ${id} did not finish`);
};

const notes = [
  ["Introduction to RAG and retrieval", "Retrieval augmented generation, or RAG, uses retrieval to fetch relevant passages. Embeddings represent text so retrieval can compare meaning."],
  ["Understanding vector databases and embeddings", "Embeddings power vector search. A vector database stores those embeddings so similarity search can find related chunks."],
  ["Hybrid search with BM25 and vector retrieval", "Hybrid search combines BM25 keyword retrieval with vector search. Reranking can reorder the combined candidate list."],
  ["Building AI agents with tool calling", "Agents use tool calling to invoke functions while completing a task. This note does not cover agent memory."],
  ["Evaluating LLM applications", "Evaluation measures whether a RAG system returns useful context and answers. It does not cover agent evaluation or observability."],
];

(async () => {
  const health = await request("/health");
  const registered = await request("/auth/register", {
    method: "POST",
    body: { name: "Loop User", email, password, emailVerified: true },
  });
  if (registered.data.token) throw new Error("register issued a token");
  const blocked = await request("/auth/login", { method: "POST", body: { email, password } });
  if (blocked.status !== 403 || blocked.data.token) throw new Error("unverified login was not blocked");
  await request("/auth/verify", { method: "POST", body: { email, code: registered.data.devCode } });
  const login = await request("/auth/login", { method: "POST", body: { email, password } });
  const token = login.data.token;
  if (!token) throw new Error("verified login failed");

  const resources = [];
  for (const [title, content] of notes) {
    const created = await request("/resources", { method: "POST", token, body: { type: "note", title, content } });
    resources.push(await waitProcessed(created.data.resource._id, token));
  }

  const github = await request("/resources", {
    method: "POST",
    token,
    body: { url: "https://github.com/expressjs/express" },
  });
  const githubResource = await waitProcessed(github.data.resource._id, token);

  const article = await request("/resources", {
    method: "POST",
    token,
    body: { url: "https://nodejs.org/en/about" },
  });
  const articleResource = await waitProcessed(article.data.resource._id, token);

  const docs = await request("/resources", {
    method: "POST",
    token,
    body: { url: "https://developer.mozilla.org/en-US/docs/Web/HTTP/Overview" },
  });
  const docsResource = await waitProcessed(docs.data.resource._id, token);

  const search = await request("/search?q=" + encodeURIComponent("How can traditional keyword matching be combined with meaning-based search?"), { token });
  const empty = await request("/search?q=" + encodeURIComponent("quantum chemistry"), { token });
  const ask = await request("/brain/ask", {
    method: "POST",
    token,
    body: { question: "What have I saved about improving RAG retrieval?" },
  });
  const missing = await request("/brain/ask", {
    method: "POST",
    token,
    body: { question: "What have I saved about quantum chemistry?" },
  });
  const graph = await request("/knowledge/graph", { token });
  const gaps = await request("/knowledge/gaps", { token });

  await mongoose.connect(process.env.MONGO_URI);
  const userId = login.data.user.id || login.data.user._id;
  const [chunkCount, topicCount, conceptCount, gapCount, embeddedChunks] = await Promise.all([
    Chunk.countDocuments({ user: userId }),
    Topic.countDocuments({ user: userId }),
    Concept.countDocuments({ user: userId }),
    KnowledgeGap.countDocuments({ user: userId }),
    Chunk.countDocuments({ user: userId, embeddingSource: "provider" }),
  ]);
  const resourceCount = await Resource.countDocuments({ user: userId });
  const processed = await Resource.countDocuments({ user: userId, status: "processed" });
  const failed = await Resource.countDocuments({ user: userId, status: "failed" });

  console.log(JSON.stringify({
    email,
    health: health.data,
    unverifiedBlocked: blocked.status === 403 && !blocked.data.token,
    notes: resources.map((resource) => ({
      title: resource.title,
      status: resource.status,
      analysisSource: resource.analysisSource,
      embeddingSource: resource.embeddingSource,
      chunkCount: resource.chunkCount,
      concepts: resource.concepts,
    })),
    urls: [githubResource, articleResource, docsResource].map((resource) => ({
      title: resource.title,
      url: resource.url,
      status: resource.status,
      contentSource: resource.contentSource,
      error: resource.error,
      chunkCount: resource.chunkCount,
      analysisSource: resource.analysisSource,
    })),
    searchMode: search.data.mode,
    searchTop: search.data.results?.[0]?.title || null,
    searchWhy: search.data.results?.[0]?.why || null,
    emptyCount: empty.data.total,
    askSource: ask.data.answerSource,
    askMode: ask.data.retrievalMode,
    askSources: (ask.data.sources || []).map((source) => source.title),
    askInsufficient: missing.data.insufficient,
    nodes: graph.data.graph?.nodes?.length,
    edges: graph.data.graph?.edges?.length,
    gapTopics: (gaps.data.gaps || []).map((gap) => gap.topic),
    mongo: { resourceCount, processed, failed, chunkCount, topicCount, conceptCount, gapCount, embeddedChunks },
  }, null, 2));

  await mongoose.disconnect();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
