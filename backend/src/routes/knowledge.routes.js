const express = require("express");

const { getCurrentUser } = require("../controllers/auth.controller");
const { getKnowledgeOverview, getKnowledgeGraph, getKnowledgeGapsList, getKnowledgeStatus } = require("../controllers/knowledge.controller");
const protect = require("../middleware/auth.middleware");

const router = express.Router();

router.use(protect);
router.get("/me", getCurrentUser);
router.get("/overview", getKnowledgeOverview);
router.get("/graph", getKnowledgeGraph);
router.get("/gaps", getKnowledgeGapsList);
router.get("/status", getKnowledgeStatus);

module.exports = router;