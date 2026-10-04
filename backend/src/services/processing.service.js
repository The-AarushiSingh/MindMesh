const Resource = require("../models/Resource");
const { processResourceContent } = require("./content.service");
const { analyzeResourceContent } = require("./ai.service");
const { generateEmbedding } = require("./embedding.service");
const { rebuildUserKnowledge } = require("./knowledge.service");
const logger = require("../utils/logger");

const processResourceById = async (resourceId) => {
  const started = Date.now();
  const resource = await Resource.findById(resourceId).select("+embedding");

  if (!resource) {
    logger.warn("resource.processing.missing", { resourceId: String(resourceId) });
    return null;
  }

  if (resource.status === "processed") {
    return resource;
  }

  resource.status = "processing";
  resource.processingStartedAt = new Date();
  resource.jobAttempts = (resource.jobAttempts || 0) + 1;
  resource.error = "";
  await resource.save();

  try {
    let extracted;

    if (resource.type === "note" || !resource.url) {
      const text = resource.content || resource.description || "";
      if (!String(text).trim()) {
        throw new Error("Note has no content to process");
      }

      extracted = {
        title: resource.title || "Untitled note",
        description: resource.description || "",
        content: String(text).slice(0, 100000),
        type: "note",
        contentSource: "note",
        extractionNote: "Saved as a note. No URL was fetched.",
      };
    } else {
      extracted = await processResourceContent({
        url: resource.url,
        title: resource.title,
        description: resource.description,
      });
    }

    const analysis = await analyzeResourceContent(extracted.content);
    const embedText = [extracted.title || resource.title, analysis.summary, extracted.content]
      .filter(Boolean)
      .join("\n")
      .slice(0, 8000);
    const embedding = await generateEmbedding(embedText);
    const embeddingSource = Array.isArray(embedding) && embedding.length ? "provider" : "unavailable";

    const fresh = await Resource.findById(resourceId).select("+embedding");
    if (!fresh) {
      logger.warn("resource.deleted_during_processing", { resourceId: String(resourceId) });
      return null;
    }

    fresh.title = fresh.title || extracted.title;
    fresh.description = fresh.description || extracted.description || analysis.summary;
    fresh.summary = analysis.summary;
    fresh.content = extracted.content;
    fresh.type = fresh.type === "note" ? "note" : (extracted.type || fresh.type);
    fresh.topics = analysis.topics;
    fresh.concepts = analysis.concepts;
    fresh.keyIdeas = analysis.keyIdeas;
    fresh.difficulty = analysis.difficulty;
    fresh.prerequisites = analysis.prerequisites;
    fresh.relationships = analysis.relationships;
    fresh.analysisSource = analysis.analysisSource || "heuristic";
    fresh.providerModel = analysis.providerModel || "";
    fresh.embedding = embeddingSource === "provider" ? embedding : [];
    fresh.embeddingSource = embeddingSource;
    fresh.contentSource = extracted.contentSource || "fetched";
    fresh.extractionNote = extracted.extractionNote || "";
    fresh.error = "";
    fresh.processedAt = new Date();

    try {
      await rebuildUserKnowledge(fresh.user, fresh);
    } catch (graphError) {
      logger.error("knowledge.rebuild_failed", {
        resourceId: String(resourceId),
        userId: String(fresh.user),
        message: graphError.message,
      });
      throw new Error("The knowledge graph could not be updated");
    }

    fresh.status = "processed";
    await fresh.save();

    logger.info("resource.processed", {
      resourceId: String(resourceId),
      userId: String(fresh.user),
      durationMs: Date.now() - started,
      analysisSource: fresh.analysisSource,
      embeddingSource: fresh.embeddingSource,
      contentSource: fresh.contentSource,
    });

    return fresh;
  } catch (error) {
    const fresh = await Resource.findById(resourceId);
    if (!fresh) return null;

    if (fresh.status === "processed" && /knowledge graph/.test(error.message)) {
      fresh.status = "failed";
    }

    fresh.status = "failed";
    fresh.error = String(error.message || "Processing failed").slice(0, 1000);
    fresh.processedAt = new Date();
    await fresh.save();

    logger.error("resource.processing.failed", {
      resourceId: String(resourceId),
      userId: String(fresh.user),
      durationMs: Date.now() - started,
      attempts: fresh.jobAttempts,
      message: fresh.error,
    });

    return fresh;
  }
};

module.exports = {
  processResourceById,
};
