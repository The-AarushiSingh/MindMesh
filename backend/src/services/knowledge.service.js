const mongoose = require("mongoose");
const Resource = require("../models/Resource");
const Topic = require("../models/Topic");
const Concept = require("../models/Concept");
const KnowledgeGap = require("../models/KnowledgeGap");
const { CONCEPT_GRAPH, displayName, undirectedGraph } = require("./vocabulary");
const logger = require("../utils/logger");

const normalizeEntityName = (value = "") => String(value).trim().toLowerCase();

const recencyFactor = (date, now = new Date()) => {
  if (!date) return 0;
  const days = (now.getTime() - new Date(date).getTime()) / (1000 * 60 * 60 * 24);
  if (Number.isNaN(days) || days < 0) return 1;
  if (days <= 30) return 1;
  if (days <= 90) return 0.5;
  if (days <= 180) return 0.2;
  return 0;
};

// coverage_score =
//   0.55 * min(resourceCount, 4) / 4
// + 0.15 * min(conceptCount, 6) / 6
// + 0.15 * min(graphConnections, 6) / 6
// + 0.15 * recencyFactor
const coverageScore = ({
  resourceCount = 0,
  conceptCount = 0,
  graphConnections = 0,
  lastActivity = null,
}, now = new Date()) => {
  const score =
    0.55 * (Math.min(resourceCount, 4) / 4)
    + 0.15 * (Math.min(conceptCount, 6) / 6)
    + 0.15 * (Math.min(graphConnections, 6) / 6)
    + 0.15 * recencyFactor(lastActivity, now);

  return Math.round(score * 1000) / 1000;
};

const classifyCoverage = (score, resourceCount) => {
  if (!resourceCount) return "unexplored";
  if (score >= 0.75) return "well explored";
  if (score >= 0.5) return "developing";
  return "underexplored";
};

const shortestPath = (start, goal) => {
  const graph = undirectedGraph();
  const queue = [[start]];
  const seen = new Set([start]);

  while (queue.length) {
    const path = queue.shift();
    const node = path[path.length - 1];
    if (node === goal) return path;
    (graph[node] || []).forEach((next) => {
      if (seen.has(next) || path.length > 6) return;
      seen.add(next);
      queue.push([...path, next]);
    });
  }

  return [start, goal];
};

const buildGapRecommendations = (entities = [], now = new Date()) => {
  const owned = new Map();

  entities.forEach((entity) => {
    const normalizedName = normalizeEntityName(entity.normalizedName || entity.name);
    if (!normalizedName) return;

    const resourceCount = entity.resourceCount || 0;
    const scored = {
      ...entity,
      normalizedName,
      name: entity.name || displayName(normalizedName),
      resourceCount,
      conceptCount: entity.conceptCount || 0,
      graphConnections: entity.graphConnections || 0,
      lastActivity: entity.lastActivity || null,
    };
    scored.coverageScore = coverageScore(scored, now);
    scored.band = classifyCoverage(scored.coverageScore, resourceCount);
    owned.set(normalizedName, scored);
  });

  if (![...owned.values()].some((entity) => entity.resourceCount > 0)) {
    return [];
  }

  const gaps = new Map();

  owned.forEach((anchor) => {
    if (!anchor.resourceCount) return;
    const neighbors = CONCEPT_GRAPH[anchor.normalizedName] || [];

    neighbors.forEach((neighbor) => {
      const existing = owned.get(neighbor);
      const neighborScore = existing
        ? existing
        : {
          normalizedName: neighbor,
          name: displayName(neighbor),
          resourceCount: 0,
          conceptCount: 0,
          graphConnections: 0,
          lastActivity: null,
          coverageScore: 0,
          band: "unexplored",
        };

      if (!existing) {
        neighborScore.coverageScore = 0;
        neighborScore.band = "unexplored";
      }

      if (neighborScore.band === "well explored" || neighborScore.band === "developing") {
        return;
      }

      const current = gaps.get(neighbor);
      if (current && current.anchorScore >= anchor.coverageScore) return;

      const path = shortestPath(anchor.normalizedName, neighbor).map((name) => ({
        name: displayName(name),
        status: owned.get(name)?.resourceCount ? "covered" : "recommended",
      }));

      gaps.set(neighbor, {
        topic: displayName(neighbor),
        concept: displayName(neighbor),
        anchor: anchor.name,
        band: neighborScore.band,
        coverageScore: neighborScore.coverageScore,
        why: `You have ${anchor.resourceCount} saved resource${anchor.resourceCount === 1 ? "" : "s"} mentioning ${anchor.name} (${anchor.band}, coverage ${anchor.coverageScore}). ${displayName(neighbor)} is a neighboring concept in the knowledge map and is ${neighborScore.resourceCount ? `${neighborScore.band} with ${neighborScore.resourceCount} resource${neighborScore.resourceCount === 1 ? "" : "s"}` : "absent from your archive"}.`,
        relatedConcepts: [anchor.name],
        prerequisites: path.filter((step) => step.status === "covered").map((step) => step.name),
        recommendedNext: `A reasonable next step from ${anchor.name} is ${displayName(neighbor)}. This is a recommendation based on your saved concepts, not a required curriculum.`,
        learningPath: path,
        confidence: Math.round(Math.min(0.95, anchor.coverageScore * (1 - neighborScore.coverageScore)) * 100) / 100,
        signals: {
          resourceCount: neighborScore.resourceCount,
          conceptCount: neighborScore.conceptCount,
          graphConnections: neighborScore.graphConnections,
          recencyFactor: recencyFactor(neighborScore.lastActivity, now),
          anchorResourceCount: anchor.resourceCount,
          anchorBand: anchor.band,
          anchorScore: anchor.coverageScore,
        },
        anchorScore: anchor.coverageScore,
      });
    });
  });

  return [...gaps.values()]
    .sort((a, b) => b.anchorScore - a.anchorScore || a.topic.localeCompare(b.topic))
    .slice(0, 6)
    .map(({ anchorScore, ...gap }) => gap);
};

const emptyCounts = () => ({
  saved: 0,
  processing: 0,
  processed: 0,
  failed: 0,
});

const publicResource = (resource) => ({
  id: resource._id,
  title: resource.title || "Untitled resource",
  url: resource.url || "",
  summary: resource.summary || resource.description || "",
  type: resource.type,
  status: resource.status,
  topics: resource.topics || [],
  concepts: resource.concepts || [],
  createdAt: resource.createdAt,
  error: resource.error || "",
});

const buildKnowledgeOverview = async (userId) => {
  const userObjectId = new mongoose.Types.ObjectId(String(userId));
  const [statusRows, recentResources, topics, concepts, gaps] = await Promise.all([
    Resource.aggregate([
      { $match: { user: userObjectId } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
    Resource.find({ user: userId })
      .select("title url summary description type status topics concepts createdAt error")
      .sort({ createdAt: -1 })
      .limit(5)
      .lean(),
    Topic.find({ user: userId }).sort({ occurrenceCount: -1 }).limit(12).lean(),
    Concept.find({ user: userId }).sort({ occurrenceCount: -1 }).lean(),
    KnowledgeGap.find({ user: userId }).sort({ confidence: -1, topic: 1 }).limit(3).lean(),
  ]);

  const counts = emptyCounts();
  statusRows.forEach((row) => {
    if (counts[row._id] !== undefined) counts[row._id] = row.count;
  });

  const coverage = concepts.map((concept) => {
    const resourceCount = concept.resources?.length || concept.occurrenceCount || 0;
    const graphConnections = concept.relatedConcepts?.length || 0;
    const score = coverageScore({
      resourceCount,
      conceptCount: graphConnections + (resourceCount ? 1 : 0),
      graphConnections,
      lastActivity: concept.lastSeenAt,
    });

    return {
      name: concept.name,
      type: "concept",
      resourceCount,
      coverageScore: score,
      band: classifyCoverage(score, resourceCount),
    };
  });

  const topTopics = topics.slice(0, 5).map((topic) => ({
    name: topic.name,
    count: topic.occurrenceCount || topic.resources?.length || 0,
  }));

  return {
    totalResources: Object.values(counts).reduce((sum, count) => sum + count, 0),
    savedResources: counts.saved,
    processingResources: counts.processing,
    processedResources: counts.processed,
    failedResources: counts.failed,
    topTopics,
    conceptCount: concepts.length,
    recentResources: recentResources.map(publicResource),
    strongest: coverage.filter((item) => item.band === "well explored" || item.band === "developing").slice(0, 5),
    underexplored: coverage.filter((item) => item.band === "underexplored").slice(0, 5),
    nextRecommendation: gaps[0]
      ? {
        concept: gaps[0].concept || gaps[0].topic,
        why: gaps[0].why,
        learningPath: gaps[0].learningPath || [],
        recommendedNext: gaps[0].recommendedNext,
      }
      : null,
  };
};

const replaceUserGraph = async (userId, resources) => {
  const topicMap = new Map();
  const conceptMap = new Map();

  resources.forEach((resource) => {
    const topicNames = [...new Set((resource.topics || []).map(normalizeEntityName).filter(Boolean))];
    const conceptNames = [...new Set((resource.concepts || []).map(normalizeEntityName).filter(Boolean))];
    const seenAt = resource.createdAt || new Date();

    topicNames.forEach((name) => {
      if (!topicMap.has(name)) {
        topicMap.set(name, {
          name: displayName(name) === name ? (resource.topics || []).find((topic) => normalizeEntityName(topic) === name) || name : displayName(name),
          resources: new Set(),
          concepts: new Set(conceptNames),
          related: new Set(topicNames.filter((other) => other !== name)),
          lastSeenAt: seenAt,
        });
      }
      const entry = topicMap.get(name);
      entry.resources.add(String(resource._id));
      conceptNames.forEach((concept) => entry.concepts.add(concept));
      topicNames.forEach((other) => {
        if (other !== name) entry.related.add(other);
      });
      if (new Date(seenAt) > new Date(entry.lastSeenAt)) entry.lastSeenAt = seenAt;
    });

    conceptNames.forEach((name) => {
      const original = (resource.concepts || []).find((concept) => normalizeEntityName(concept) === name) || displayName(name);
      if (!conceptMap.has(name)) {
        conceptMap.set(name, {
          name: CONCEPT_GRAPH[name] ? displayName(name) : original,
          resources: new Set(),
          topics: new Set(topicNames),
          related: new Set(conceptNames.filter((other) => other !== name)),
          lastSeenAt: seenAt,
        });
      }
      const entry = conceptMap.get(name);
      entry.resources.add(String(resource._id));
      topicNames.forEach((topic) => entry.topics.add(topic));
      conceptNames.forEach((other) => {
        if (other !== name) entry.related.add(other);
      });
      if (new Date(seenAt) > new Date(entry.lastSeenAt)) entry.lastSeenAt = seenAt;
    });
  });

  await Topic.deleteMany({ user: userId, normalizedName: { $nin: [...topicMap.keys()] } });
  await Concept.deleteMany({ user: userId, normalizedName: { $nin: [...conceptMap.keys()] } });

  const topicDocs = new Map();
  for (const [normalizedName, entry] of topicMap) {
    const doc = await Topic.findOneAndUpdate(
      { user: userId, normalizedName },
      {
        $set: {
          user: userId,
          name: entry.name,
          normalizedName,
          description: `${entry.name} appears in ${entry.resources.size} saved resource${entry.resources.size === 1 ? "" : "s"}.`,
          resources: [...entry.resources],
          occurrenceCount: entry.resources.size,
          lastSeenAt: entry.lastSeenAt,
        },
      },
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
    );
    topicDocs.set(normalizedName, doc);
  }

  const conceptDocs = new Map();
  for (const [normalizedName, entry] of conceptMap) {
    const doc = await Concept.findOneAndUpdate(
      { user: userId, normalizedName },
      {
        $set: {
          user: userId,
          name: entry.name,
          normalizedName,
          description: `${entry.name} appears in ${entry.resources.size} saved resource${entry.resources.size === 1 ? "" : "s"}.`,
          resources: [...entry.resources],
          occurrenceCount: entry.resources.size,
          lastSeenAt: entry.lastSeenAt,
        },
      },
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
    );
    conceptDocs.set(normalizedName, doc);
  }

  for (const [normalizedName, entry] of topicMap) {
    const doc = topicDocs.get(normalizedName);
    doc.relatedTopics = [...entry.related].map((name) => topicDocs.get(name)?._id).filter(Boolean);
    doc.concepts = [...entry.concepts].map((name) => conceptDocs.get(name)?._id).filter(Boolean);
    await doc.save();
  }

  for (const [normalizedName, entry] of conceptMap) {
    const doc = conceptDocs.get(normalizedName);
    doc.relatedConcepts = [...entry.related].map((name) => conceptDocs.get(name)?._id).filter(Boolean);
    doc.topics = [...entry.topics].map((name) => topicDocs.get(name)?._id).filter(Boolean);
    await doc.save();
  }

  const entities = [...conceptMap.entries()].map(([normalizedName, entry]) => ({
    name: entry.name,
    normalizedName,
    resourceCount: entry.resources.size,
    conceptCount: entry.related.size + 1,
    graphConnections: entry.related.size,
    lastActivity: entry.lastSeenAt,
  }));

  const gaps = buildGapRecommendations(entities);
  await KnowledgeGap.deleteMany({ user: userId });
  if (gaps.length) {
    await KnowledgeGap.insertMany(gaps.map((gap) => ({ user: userId, ...gap })));
  }

  logger.info("knowledge.rebuilt", {
    userId: String(userId),
    topics: topicMap.size,
    concepts: conceptMap.size,
    gaps: gaps.length,
  });
};

const rebuildUserKnowledge = async (userId, extraResource = null) => {
  const resources = await Resource.find({ user: userId, status: "processed" })
    .select("title topics concepts createdAt")
    .lean();

  const merged = extraResource
    ? [
      ...resources.filter((resource) => String(resource._id) !== String(extraResource._id)),
      {
        _id: extraResource._id,
        title: extraResource.title,
        topics: extraResource.topics,
        concepts: extraResource.concepts,
        createdAt: extraResource.createdAt,
      },
    ]
    : resources;

  await replaceUserGraph(userId, merged);
};

const buildKnowledgeGraph = async (userId) => {
  const [topics, concepts, resources] = await Promise.all([
    Topic.find({ user: userId }).lean(),
    Concept.find({ user: userId }).lean(),
    Resource.find({ user: userId, status: "processed" })
      .select("title topics concepts")
      .sort({ createdAt: -1 })
      .limit(40)
      .lean(),
  ]);

  const nodes = [];
  const edges = [];
  const topicById = new Map(topics.map((topic) => [String(topic._id), topic]));
  const conceptById = new Map(concepts.map((concept) => [String(concept._id), concept]));

  topics.forEach((topic) => {
    nodes.push({
      id: `topic:${topic.normalizedName}`,
      label: topic.name,
      type: "topic",
      resourceCount: topic.occurrenceCount || 0,
    });
  });

  concepts.forEach((concept) => {
    const resourceCount = concept.occurrenceCount || concept.resources?.length || 0;
    const graphConnections = concept.relatedConcepts?.length || 0;
    const score = coverageScore({
      resourceCount,
      conceptCount: graphConnections + (resourceCount ? 1 : 0),
      graphConnections,
      lastActivity: concept.lastSeenAt,
    });

    nodes.push({
      id: `concept:${concept.normalizedName}`,
      label: concept.name,
      type: "concept",
      resourceCount,
      coverageScore: score,
      band: classifyCoverage(score, resourceCount),
    });

    (concept.relatedConcepts || []).forEach((relatedId) => {
      const related = conceptById.get(String(relatedId));
      if (!related) return;
      const edgeId = [concept.normalizedName, related.normalizedName].sort().join(":");
      if (edges.some((edge) => edge.id === edgeId)) return;
      edges.push({
        id: edgeId,
        source: `concept:${concept.normalizedName}`,
        target: `concept:${related.normalizedName}`,
        type: "co_occurs",
      });
    });
  });

  resources.forEach((resource) => {
    const resourceId = `resource:${resource._id}`;
    nodes.push({ id: resourceId, label: resource.title || "Untitled resource", type: "resource" });
    (resource.topics || []).forEach((topic) => {
      edges.push({
        source: resourceId,
        target: `topic:${normalizeEntityName(topic)}`,
        type: "belongs_to",
      });
    });
    (resource.concepts || []).forEach((concept) => {
      edges.push({
        source: resourceId,
        target: `concept:${normalizeEntityName(concept)}`,
        type: "mentions",
      });
    });
  });

  const exploration = concepts
    .map((concept) => {
      const resourceCount = concept.occurrenceCount || 0;
      const graphConnections = concept.relatedConcepts?.length || 0;
      const score = coverageScore({
        resourceCount,
        conceptCount: graphConnections + (resourceCount ? 1 : 0),
        graphConnections,
        lastActivity: concept.lastSeenAt,
      });

      return {
        id: concept._id,
        name: concept.name,
        resourceCount,
        coverageScore: score,
        band: classifyCoverage(score, resourceCount),
        related: (concept.relatedConcepts || [])
          .map((relatedId) => conceptById.get(String(relatedId))?.name)
          .filter(Boolean),
        topics: (concept.topics || [])
          .map((topicId) => topicById.get(String(topicId))?.name)
          .filter(Boolean),
        resources: resources
          .filter((resource) => (resource.concepts || []).some((name) => normalizeEntityName(name) === concept.normalizedName))
          .map((resource) => ({ id: resource._id, title: resource.title || "Untitled resource" })),
      };
    })
    .sort((a, b) => b.resourceCount - a.resourceCount || a.name.localeCompare(b.name));

  return { nodes, edges, concepts: exploration, topics: topics.map((topic) => ({
    id: topic._id,
    name: topic.name,
    resourceCount: topic.occurrenceCount || 0,
  })) };
};

const deriveKnowledgeGaps = async (userId) => {
  await rebuildUserKnowledge(userId);
  return KnowledgeGap.find({ user: userId }).sort({ confidence: -1, topic: 1 }).lean();
};

const getKnowledgeGaps = async (userId) => {
  return KnowledgeGap.find({ user: userId }).sort({ confidence: -1, topic: 1 }).lean();
};

module.exports = {
  normalizeEntityName,
  recencyFactor,
  coverageScore,
  classifyCoverage,
  buildGapRecommendations,
  buildKnowledgeOverview,
  rebuildUserKnowledge,
  buildKnowledgeGraph,
  deriveKnowledgeGaps,
  getKnowledgeGaps,
};
