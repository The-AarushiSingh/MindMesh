const express = require("express");

const { askBrain } = require("../controllers/brain.controller");
const protect = require("../middleware/auth.middleware");

const router = express.Router();

router.use(protect);
router.post("/ask", askBrain);

module.exports = router;