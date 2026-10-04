const express = require("express");

const {
  registerUser,
  loginUser,
  getCurrentUser,
  verifyEmail,
  resendVerification,
} = require("../controllers/auth.controller");
const protect = require("../middleware/auth.middleware");

const router = express.Router();

router.post("/register", registerUser);
router.post("/login", loginUser);
router.post("/verify", verifyEmail);
router.post("/resend-verification", resendVerification);
router.get("/me", protect, getCurrentUser);

module.exports = router;