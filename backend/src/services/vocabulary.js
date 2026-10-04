const DISPLAY_NAMES = {
  rag: "RAG",
  bm25: "BM25",
  embeddings: "Embeddings",
  retrieval: "Retrieval",
  "vector search": "Vector search",
  "hybrid search": "Hybrid search",
  reranking: "Reranking",
  chunking: "Chunking",
  similarity: "Similarity",
  evaluation: "Evaluation",
  "cross encoder": "Cross encoder",
  observability: "Observability",
  agents: "Agents",
  "tool calling": "Tool calling",
  "agent memory": "Agent memory",
  "agent evaluation": "Agent evaluation",
  "knowledge graph": "Knowledge graph",
  entities: "Entities",
  relationships: "Relationships",
};

// Curated adjacency used only for recommendations.
// Observed graph edges still come from concepts that co-occur in saved resources.
const CONCEPT_GRAPH = {
  rag: ["retrieval", "embeddings", "chunking"],
  retrieval: ["bm25", "vector search", "hybrid search", "reranking", "evaluation"],
  embeddings: ["vector search", "chunking", "similarity"],
  "vector search": ["hybrid search", "embeddings", "reranking"],
  "hybrid search": ["bm25", "vector search", "reranking"],
  reranking: ["evaluation", "cross encoder"],
  bm25: ["hybrid search", "retrieval"],
  evaluation: ["reranking", "observability"],
  agents: ["tool calling", "agent memory", "agent evaluation"],
  "tool calling": ["agents", "agent memory"],
  "agent memory": ["agents", "agent evaluation"],
  "agent evaluation": ["observability", "evaluation"],
  observability: ["agent evaluation", "evaluation"],
  chunking: ["embeddings", "rag"],
  similarity: ["embeddings", "vector search"],
  "cross encoder": ["reranking"],
  "knowledge graph": ["entities", "relationships"],
  entities: ["knowledge graph", "relationships"],
  relationships: ["knowledge graph", "entities"],
};

const ALIASES = [
  ["retrieval-augmented generation", "rag"],
  ["retrieval augmented generation", "rag"],
  ["vector database", "vector search"],
  ["vector databases", "vector search"],
  ["re-ranking", "reranking"],
  ["cross-encoder", "cross encoder"],
  ["knowledge graphs", "knowledge graph"],
];

const PHRASES = Object.keys(CONCEPT_GRAPH).sort((a, b) => b.length - a.length);

const displayName = (normalizedName) => DISPLAY_NAMES[normalizedName] || normalizedName;

const canonicalizeText = (value = "") => {
  let text = String(value).toLowerCase();
  ALIASES.forEach(([alias, canonical]) => {
    text = text.split(alias).join(canonical);
  });
  return text;
};

const matchConcepts = (value = "") => {
  const haystack = canonicalizeText(value);
  const found = [];

  PHRASES.forEach((phrase) => {
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`);
    const match = pattern.exec(haystack);
    if (!match) return;

    const prefix = haystack.slice(Math.max(0, match.index - 48), match.index);
    if (/\b(does not|do not|did not|without|never|not cover|doesn't)\b/.test(prefix)) return;

    found.push({
      name: displayName(phrase),
      normalizedName: phrase,
    });
  });

  return found;
};

const undirectedGraph = () => {
  const graph = {};

  Object.entries(CONCEPT_GRAPH).forEach(([node, neighbors]) => {
    if (!graph[node]) graph[node] = new Set();
    neighbors.forEach((neighbor) => {
      if (!graph[neighbor]) graph[neighbor] = new Set();
      graph[node].add(neighbor);
      graph[neighbor].add(node);
    });
  });

  return Object.fromEntries(
    Object.entries(graph).map(([node, neighbors]) => [node, [...neighbors]])
  );
};

module.exports = {
  DISPLAY_NAMES,
  CONCEPT_GRAPH,
  displayName,
  canonicalizeText,
  matchConcepts,
  undirectedGraph,
};
