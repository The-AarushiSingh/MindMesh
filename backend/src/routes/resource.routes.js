const express = require("express");

const {
  createResource,
  getResources,
  getResourceById,
  retryResource,
  deleteResource,
} = require("../controllers/resource.controller");

const protect = require("../middleware/auth.middleware");

const router = express.Router();

router.use(protect);

router.post("/", createResource);
router.get("/", getResources);
router.get("/:id", getResourceById);
router.post("/:id/retry", retryResource);
router.delete("/:id", deleteResource);

module.exports = router;