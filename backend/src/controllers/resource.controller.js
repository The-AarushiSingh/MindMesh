const Resource = require("../models/Resource");
const { processResourceContent, inferResourceTypeFromUrl } = require("../services/content.service");
const { analyzeResourceContent } = require("../services/ai.service");

const createResource = async (req, res) => {
  try {
    const { title, url, type, description } = req.body;

    if (typeof url !== "string" || !url.trim()) {
      return res.status(400).json({ message: "URL is required" });
    }

    const trimmedUrl = url.trim();

    try {
      new URL(trimmedUrl);
    } catch {
      return res.status(400).json({ message: "Please provide a valid URL" });
    }

    const derivedType = inferResourceTypeFromUrl(trimmedUrl);
    const safeType = type && ["article", "x-post", "linkedin-post", "youtube", "documentation", "github", "note", "other"].includes(type)
      ? type
      : derivedType;

    const resource = await Resource.create({
      user: req.user._id,
      title: typeof title === "string" && title.trim() ? title.trim() : undefined,
      url: trimmedUrl,
      type: safeType,
      description: typeof description === "string" ? description.trim() : undefined,
      status: "processing",
    });

    try {
      const insight = await processResourceContent({
        url: trimmedUrl,
        title: resource.title,
        description: resource.description,
      });

      const analysis = analyzeResourceContent(insight.content);

      resource.title = resource.title || insight.title;
      resource.description = insight.description;
      resource.summary = insight.summary;
      resource.content = insight.content;
      resource.type = insight.type || safeType;
      resource.topics = analysis.topics;
      resource.concepts = analysis.concepts;
      resource.keyIdeas = analysis.keyIdeas;
      resource.difficulty = analysis.difficulty;
      resource.prerequisites = analysis.prerequisites;
      resource.status = "processed";

      await resource.save();

      return res.status(201).json({
        message: "Resource saved successfully",
        resource,
      });
    } catch (processingError) {
      resource.status = "failed";
      resource.error = processingError.message;
      await resource.save();

      return res.status(201).json({
        message: "Resource was saved but could not be processed yet",
        resource,
      });
    }
  } catch (error) {
    console.error("Create resource error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

const getResources = async (req, res) => {
  try {
    const resources = await Resource.find({ user: req.user._id }).sort({ createdAt: -1 });
    return res.status(200).json({ resources });
  } catch (error) {
    console.error("Get resources error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

const getResourceById = async (req, res) => {
  try {
    const resource = await Resource.findOne({ _id: req.params.id, user: req.user._id });

    if (!resource) {
      return res.status(404).json({ message: "Resource not found" });
    }

    return res.status(200).json({ resource });
  } catch (error) {
    console.error("Get resource error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

const deleteResource = async (req, res) => {
  try {
    const resource = await Resource.findOneAndDelete({ _id: req.params.id, user: req.user._id });

    if (!resource) {
      return res.status(404).json({ message: "Resource not found" });
    }

    return res.status(200).json({ message: "Resource deleted successfully" });
  } catch (error) {
    console.error("Delete resource error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

module.exports = {
  createResource,
  getResources,
  getResourceById,
  deleteResource,
};