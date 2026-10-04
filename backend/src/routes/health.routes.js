const express = require("express");

const router = express.Router();

router.get("/", (req, res) => {
  const analysis = process.env.AI_API_KEY ? "provider" : "heuristic";
  const embeddings = process.env.EMBEDDING_API_KEY || process.env.AI_API_KEY
    ? "provider"
    : "lexical-fallback";

  res.json({
    status: "OK",
    message: "MindMesh API is running",
    analysis,
    embeddings,
    queue: "in-process",
  });
});

module.exports = router;