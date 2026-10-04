const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const logger = require("../utils/logger");
const { issueVerificationCode, resendCooldown, verifyCode } = require("../services/verification.service");

const registerUser = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (
      typeof name !== "string" ||
      typeof email !== "string" ||
      typeof password !== "string"
    ) {
      return res.status(400).json({
        message: "Name, email and password must be valid strings",
      });
    }

    const trimmedName = name.trim();
    const trimmedEmail = email.trim();

    if (!trimmedName || !trimmedEmail || !password) {
      return res.status(400).json({
        message: "Name, email and password are required",
      });
    }

    if (trimmedName.length < 2 || trimmedName.length > 100) {
      return res.status(400).json({
        message: "Name must be between 2 and 100 characters",
      });
    }

    const nameRegex = /^[\p{L}\p{M} .'-]+$/u;

    if (!nameRegex.test(trimmedName)) {
      return res.status(400).json({
        message: "Name contains invalid characters",
      });
    }

    const normalizedEmail = trimmedEmail.toLowerCase();

    if (normalizedEmail.length > 254) {
      return res.status(400).json({
        message: "Please enter a valid email address",
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(normalizedEmail)) {
      return res.status(400).json({
        message: "Please enter a valid email address",
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        message: "Password must be at least 8 characters",
      });
    }

    if (password.length > 128) {
      return res.status(400).json({
        message: "Password must not exceed 128 characters",
      });
    }

    const hasUppercase = /[A-Z]/.test(password);
    const hasLowercase = /[a-z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    const hasSpecial = /[^A-Za-z0-9]/.test(password);

    if (!hasUppercase || !hasLowercase || !hasNumber || !hasSpecial) {
      return res.status(400).json({
        message: "Password must contain uppercase, lowercase, number and special character",
      });
    }

    const existingUser = await User.findOne({ email: normalizedEmail });

    if (existingUser) {
      return res.status(409).json({
        message: "User with this email already exists",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const user = await User.create({
      name: trimmedName,
      email: normalizedEmail,
      password: hashedPassword,
      emailVerified: false,
    });

    const delivery = await issueVerificationCode(user);
    const emailFailed = delivery.emailDelivery === "failed";

    return res.status(201).json({
      message: emailFailed
        ? "Account created, but the verification email could not be sent."
        : delivery.emailDelivery === "development"
          ? "Account created. No email was sent because email delivery is in development mode."
          : "Account created. Check your email for a verification code.",
      verificationRequired: true,
      ...delivery,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        emailVerified: false,
      },
    });
  } catch (error) {
    logger.error("auth.register_failed", { message: error.message });

    if (error.code === 11000) {
      return res.status(409).json({
        message: "User with this email already exists",
      });
    }

    return res.status(500).json({
      message: "Internal server error",
    });
  }
};

const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (typeof email !== "string" || typeof password !== "string") {
      return res.status(400).json({
        message: "Email and password are required",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail || !password) {
      return res.status(400).json({
        message: "Email and password are required",
      });
    }

    const user = await User.findOne({ email: normalizedEmail });

    if (!user) {
      return res.status(401).json({
        message: "Invalid email or password",
      });
    }

    const passwordMatches = await bcrypt.compare(password, user.password);

    if (!passwordMatches) {
      return res.status(401).json({
        message: "Invalid email or password",
      });
    }

    if (user.emailVerified === false) {
      return res.status(403).json({
        message: "Verify your email before signing in.",
        code: "EMAIL_NOT_VERIFIED",
      });
    }

    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
    );

    return res.status(200).json({
      message: "Login successful",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        emailVerified: true,
      },
    });
  } catch (error) {
    logger.error("auth.login_failed", { message: error.message });

    return res.status(500).json({
      message: "Internal server error",
    });
  }
};

const getCurrentUser = async (req, res) => {
  return res.status(200).json({
    user: {
      id: req.user._id,
      name: req.user.name,
      email: req.user.email,
      emailVerified: req.user.emailVerified !== false,
    },
  });
};

const verifyEmail = async (req, res) => {
  try {
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const code = typeof req.body?.code === "string" ? req.body.code : "";

    if (!email || !code) {
      return res.status(400).json({ message: "Email and verification code are required" });
    }

    const user = await User.findOne({ email }).select("+verificationCodeHash");
    const result = await verifyCode(user, code);

    return res.status(result.status).json({
      message: result.message,
      code: result.code,
      alreadyVerified: Boolean(result.alreadyVerified),
      emailVerified: result.ok === true || Boolean(result.alreadyVerified),
    });
  } catch (error) {
    logger.error("auth.verify_failed", { message: error.message });
    return res.status(500).json({ message: "Internal server error" });
  }
};

const resendVerification = async (req, res) => {
  try {
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(200).json({
        message: "If an unverified account exists for that email, a new code has been sent.",
      });
    }

    if (user.emailVerified) {
      return res.status(200).json({
        message: "This email is already verified. You can log in.",
        alreadyVerified: true,
      });
    }

    const retryAfterSeconds = resendCooldown(user);
    if (retryAfterSeconds > 0) {
      return res.status(429).json({
        message: "Please wait before requesting another code.",
        code: "RESEND_COOLDOWN",
        retryAfterSeconds,
      });
    }

    const delivery = await issueVerificationCode(user);
    return res.status(200).json({
      message: delivery.emailDelivery === "failed"
        ? "A new code could not be sent."
        : delivery.emailDelivery === "development"
          ? "A new code was created. No email was sent because email delivery is in development mode."
          : "A new verification code has been sent.",
      ...delivery,
    });
  } catch (error) {
    logger.error("auth.resend_failed", { message: error.message });
    return res.status(500).json({ message: "Internal server error" });
  }
};

module.exports = {
  registerUser,
  loginUser,
  getCurrentUser,
  verifyEmail,
  resendVerification,
};
