const { buildKnowledgeOverview, buildKnowledgeGraph, getKnowledgeGaps } = require("../services/knowledge.service");
const logger = require("../utils/logger");

const getKnowledgeOverview = async (req, res) => {
  try {
    const overview = await buildKnowledgeOverview(req.user._id);
    return res.status(200).json({ overview });
  } catch (error) {
    logger.error("knowledge.overview_failed", { message: error.message });
    return res.status(500).json({ message: "Internal server error" });
  }
};

const getKnowledgeGraph = async (req, res) => {
  try {
    const graph = await buildKnowledgeGraph(req.user._id);
    return res.status(200).json({ graph });
  } catch (error) {
    logger.error("knowledge.graph_failed", { message: error.message });
    return res.status(500).json({ message: "Internal server error" });
  }
};

const getKnowledgeGapsList = async (req, res) => {
  try {
    const gaps = await getKnowledgeGaps(req.user._id);
    return res.status(200).json({ gaps });
  } catch (error) {
    logger.error("knowledge.gaps_failed", { message: error.message });
    return res.status(500).json({ message: "Internal server error" });
  }
};

const getKnowledgeStatus = async (req, res) => {
  try {
    const overview = await buildKnowledgeOverview(req.user._id);
    const graph = await buildKnowledgeGraph(req.user._id);
    const gaps = await getKnowledgeGaps(req.user._id);

    return res.status(200).json({
      overview,
      graph,
      gaps,
    });
  } catch (error) {
    logger.error("knowledge.status_failed", { message: error.message });
    return res.status(500).json({ message: "Internal server error" });
  }
};

module.exports = {
  getKnowledgeOverview,
  getKnowledgeGraph,
  getKnowledgeGapsList,
  getKnowledgeStatus,
};
