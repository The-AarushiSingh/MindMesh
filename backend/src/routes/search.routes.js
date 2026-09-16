const express = require("express");

const { searchResources } = require("../controllers/search.controller");
const protect = require("../middleware/auth.middleware");

const router = express.Router();

router.use(protect);
router.get("/", searchResources);

module.exports = router;