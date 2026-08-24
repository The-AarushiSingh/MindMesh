import express from "express";
import cors from "cors";
import { config } from "./config";
import { connectDb } from "./db";
import { requestLogger, notFoundHandler, errorHandler } from "./middleware";

const app = express();

app.use(cors());
app.use(express.json());
app.use(requestLogger);

app.get("/health", (req, res) => {
  res.json({ status: "ok", env: config.nodeEnv });
});

// TODO: mount real routes here, e.g.
// import authRoutes from "./routes/auth";
// import resourceRoutes from "./routes/resources";
// app.use("/api/auth", authRoutes);
// app.use("/api/resources", resourceRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

async function start() {
  try {
    await connectDb();
    app.listen(config.port, () => {
      console.log(`🚀 MindMesh API running on http://localhost:${config.port}`);
    });
  } catch (err) {
    console.error("Failed to start server:", err);
    process.exit(1);
  }
}

start();