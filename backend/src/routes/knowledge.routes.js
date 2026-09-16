const express = require("express");

const { getCurrentUser } = require("../controllers/auth.controller");
const protect = require("../middleware/auth.middleware");

const router = express.Router();

router.use(protect);
router.get("/me", getCurrentUser);

module.exports = router;