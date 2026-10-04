const express = require("express");
const cors = require("cors");

const healthRoutes = require("./routes/health.routes");
const authRoutes = require("./routes/auth.routes");
const resourceRoutes = require("./routes/resource.routes");
const searchRoutes = require("./routes/search.routes");
const brainRoutes = require("./routes/brain.routes");
const knowledgeRoutes = require("./routes/knowledge.routes");

const logger = require("./utils/logger");

const app = express();

app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.use("/api/health", healthRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/resources", resourceRoutes);
app.use("/api/search", searchRoutes);
app.use("/api/brain", brainRoutes);
app.use("/api/knowledge", knowledgeRoutes);

app.use((req, res) => {
  res.status(404).json({ message: "Route not found" });
});

app.use((error, req, res, next) => {
  if (error.type === "entity.parse.failed") {
    return res.status(400).json({ message: "Request body must be valid JSON" });
  }

  logger.error("request.failed", {
    method: req.method,
    path: req.path,
    message: error.message,
  });

  return res.status(error.status || 500).json({
    message: error.status ? error.message : "Internal server error",
  });
});

module.exports = app;