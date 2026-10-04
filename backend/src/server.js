require("dotenv").config();

const app = require("./app");
const connectDB = require("./config/db");
const { recoverPendingJobs } = require("./services/job.service");
const logger = require("./utils/logger");

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    await connectDB();
    await recoverPendingJobs();

    app.listen(PORT, () => {
      logger.info("server.started", { port: Number(PORT) });
    });
  } catch (error) {
    logger.error("server.start_failed", { message: error.message });
    process.exit(1);
  }
};

startServer();