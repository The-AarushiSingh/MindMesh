const mongoose = require("mongoose");
const Resource = require("../models/Resource");
const Chunk = require("../models/Chunk");
const { inferResourceTypeFromUrl, assertFetchableUrl } = require("../services/content.service");
const { enqueueResource } = require("../services/job.service");
const { rebuildUserKnowledge } = require("../services/knowledge.service");
const { serializeResource } = require("../utils/serialize");
const logger = require("../utils/logger");

const RESOURCE_TYPES = ["article", "x-post", "linkedin-post", "youtube", "documentation", "github", "note", "other"];

const parsePagination = (query) => {
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 20, 1), 50);
  return { page, limit, skip: (page - 1) * limit };
};

const createResource = async (req, res) => {
  try {
    const { title, url, type, description, content } = req.body;
    const trimmedUrl = typeof url === "string" ? url.trim() : "";
    const noteContent = typeof content === "string" ? content.trim() : "";
    const noteDescription = typeof description === "string" ? description.trim() : "";
    const requestedType = RESOURCE_TYPES.includes(type) ? type : "";
    const isNote = requestedType === "note" || (!trimmedUrl && (noteContent || noteDescription));

    if (!trimmedUrl && !isNote) {
      return res.status(400).json({ message: "A URL or note content is required" });
    }

    if (isNote && !noteContent && !noteDescription) {
      return res.status(400).json({ message: "Note content is required" });
    }

    let safeType = requestedType || "article";
    if (trimmedUrl) {
      try {
        assertFetchableUrl(trimmedUrl);
      } catch (error) {
        return res.status(400).json({ message: error.message });
      }
      safeType = requestedType && requestedType !== "note"
        ? requestedType
        : inferResourceTypeFromUrl(trimmedUrl);
    } else {
      safeType = "note";
    }

    if (trimmedUrl) {
      const existing = await Resource.findOne({ user: req.user._id, url: trimmedUrl });
      if (existing) {
        return res.status(409).json({
          message: "You already saved this URL",
          resource: serializeResource(existing),
        });
      }
    }

    const resource = await Resource.create({
      user: req.user._id,
      title: typeof title === "string" && title.trim() ? title.trim() : undefined,
      url: trimmedUrl,
      type: safeType,
      description: noteDescription,
      content: isNote ? (noteContent || noteDescription) : "",
      status: "saved",
      contentSource: isNote ? "note" : "fetched",
      analysisSource: "unavailable",
    });

    enqueueResource(resource._id);

    return res.status(201).json({
      message: "Resource saved and queued for processing",
      resource: serializeResource(resource),
    });
  } catch (error) {
    logger.error("resource.create_failed", { message: error.message });

    if (error.code === 11000) {
      return res.status(409).json({ message: "You already saved this URL" });
    }

    return res.status(500).json({ message: "Internal server error" });
  }
};

const getResources = async (req, res) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const filter = { user: req.user._id };
    const [resources, total] = await Promise.all([
      Resource.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Resource.countDocuments(filter),
    ]);

    return res.status(200).json({
      resources: resources.map((resource) => serializeResource(resource)),
      page,
      limit,
      total,
      hasMore: skip + resources.length < total,
    });
  } catch (error) {
    logger.error("resource.list_failed", { message: error.message });
    return res.status(500).json({ message: "Internal server error" });
  }
};

const getResourceById = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid resource id" });
    }

    const resource = await Resource.findOne({ _id: req.params.id, user: req.user._id });

    if (!resource) {
      return res.status(404).json({ message: "Resource not found" });
    }

    const chunks = await Chunk.find({ resource: resource._id, user: req.user._id })
      .sort({ index: 1 })
      .limit(12)
      .select("index text embeddingSource embeddingModel dimensions")
      .lean();

    return res.status(200).json({
      resource: {
        ...serializeResource(resource, { includeContent: true }),
        chunks: chunks.map((chunk) => ({
          index: chunk.index,
          excerpt: chunk.text.slice(0, 280),
          embeddingSource: chunk.embeddingSource,
          embeddingModel: chunk.embeddingModel || "",
          dimensions: chunk.dimensions || 0,
        })),
      },
    });
  } catch (error) {
    logger.error("resource.read_failed", { message: error.message });
    return res.status(500).json({ message: "Internal server error" });
  }
};

const retryResource = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid resource id" });
    }

    const resource = await Resource.findOne({ _id: req.params.id, user: req.user._id });
    if (!resource) {
      return res.status(404).json({ message: "Resource not found" });
    }

    if (resource.status === "processing") {
      return res.status(409).json({ message: "This resource is already processing" });
    }

    resource.status = "saved";
    resource.error = "";
    await resource.save();
    enqueueResource(resource._id);

    return res.status(202).json({
      message: "Resource queued for processing",
      resource: serializeResource(resource),
    });
  } catch (error) {
    logger.error("resource.retry_failed", { message: error.message });
    return res.status(500).json({ message: "Internal server error" });
  }
};

const deleteResource = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid resource id" });
    }

    const resource = await Resource.findOneAndDelete({ _id: req.params.id, user: req.user._id });

    if (!resource) {
      return res.status(404).json({ message: "Resource not found" });
    }

    await Chunk.deleteMany({ resource: resource._id, user: req.user._id });
    await rebuildUserKnowledge(req.user._id);

    return res.status(200).json({ message: "Resource deleted successfully" });
  } catch (error) {
    logger.error("resource.delete_failed", { message: error.message });
    return res.status(500).json({ message: "Internal server error" });
  }
};

module.exports = {
  createResource,
  getResources,
  getResourceById,
  retryResource,
  deleteResource,
};
