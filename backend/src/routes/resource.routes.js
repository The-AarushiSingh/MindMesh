const express = require("express");

const {
  createResource,
  getResources,
  getResourceById,
  deleteResource,
} = require("../controllers/resource.controller");

const protect = require("../middleware/auth.middleware");

const router = express.Router();

router.use(protect);

router.post("/", createResource);
router.get("/", getResources);
router.get("/:id", getResourceById);
router.delete("/:id", deleteResource);

module.exports = router;