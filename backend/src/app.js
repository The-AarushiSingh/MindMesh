const express = require("express");
const cors = require("cors");

const healthRoutes = require("./routes/health.routes");
const authRoutes = require("./routes/auth.routes");
const resourceRoutes = require("./routes/resource.routes");
const searchRoutes = require("./routes/search.routes");
const brainRoutes = require("./routes/brain.routes");
const knowledgeRoutes = require("./routes/knowledge.routes");

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/health", healthRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/resources", resourceRoutes);
app.use("/api/search", searchRoutes);
app.use("/api/brain", brainRoutes);
app.use("/api/knowledge", knowledgeRoutes);

module.exports = app;