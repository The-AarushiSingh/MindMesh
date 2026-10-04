const Resource = require("../models/Resource");
const { processResourceById } = require("./processing.service");
const logger = require("../utils/logger");

const queue = [];
const queued = new Set();
const waiters = [];
let active = false;

const settleWaiters = () => {
  if (active || queue.length) return;
  while (waiters.length) {
    waiters.shift()();
  }
};

const drain = async () => {
  if (active) return;
  active = true;

  while (queue.length) {
    const resourceId = queue.shift();
    queued.delete(resourceId);

    try {
      await processResourceById(resourceId);
    } catch (error) {
      logger.error("job.failed", {
        resourceId,
        message: error.message,
      });
    }
  }

  active = false;
  settleWaiters();
};

const enqueueResource = (resourceId) => {
  const key = String(resourceId);
  if (queued.has(key)) return false;
  queued.add(key);
  queue.push(key);
  logger.info("job.enqueued", { resourceId: key, depth: queue.length });
  drain();
  return true;
};

const whenIdle = () => {
  if (!active && queue.length === 0) return Promise.resolve();
  return new Promise((resolve) => {
    waiters.push(resolve);
  });
};

const recoverPendingJobs = async () => {
  const pending = await Resource.find({ status: { $in: ["saved", "processing"] } }).select("_id");
  pending.forEach((resource) => enqueueResource(resource._id));
  logger.info("jobs.recovered", { count: pending.length });
  return pending.length;
};

module.exports = {
  enqueueResource,
  whenIdle,
  recoverPendingJobs,
};
