const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const User = require("../models/User");

const registerUser = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // 1. Validate field types
    if (
      typeof name !== "string" ||
      typeof email !== "string" ||
      typeof password !== "string"
    ) {
      return res.status(400).json({
        message: "Name, email and password must be valid strings",
      });
    }

    // 2. Trim values that should not contain surrounding whitespace
    const trimmedName = name.trim();
    const trimmedEmail = email.trim();

    // 3. Validate required fields
    if (!trimmedName || !trimmedEmail || !password) {
      return res.status(400).json({
        message: "Name, email and password are required",
      });
    }

    // 4. Validate name length
    if (trimmedName.length < 2 || trimmedName.length > 100) {
      return res.status(400).json({
        message: "Name must be between 2 and 100 characters",
      });
    }

    // 5. Validate name characters
    const nameRegex = /^[\p{L}\p{M} .'-]+$/u;

    if (!nameRegex.test(trimmedName)) {
      return res.status(400).json({
        message: "Name contains invalid characters",
      });
    }

    // 6. Normalize email explicitly
    const normalizedEmail = trimmedEmail.toLowerCase();

    // 7. Validate email length
    if (normalizedEmail.length > 254) {
      return res.status(400).json({
        message: "Please enter a valid email address",
      });
    }

    // 8. Basic email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(normalizedEmail)) {
      return res.status(400).json({
        message: "Please enter a valid email address",
      });
    }

    // 9. Password validation
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

    // Keep the stricter policy for now.
    const hasUppercase = /[A-Z]/.test(password);
    const hasLowercase = /[a-z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    const hasSpecial = /[^A-Za-z0-9]/.test(password);

    if (!hasUppercase || !hasLowercase || !hasNumber || !hasSpecial) {
      return res.status(400).json({
        message:
          "Password must contain uppercase, lowercase, number and special character",
      });
    }

    // 10. Check whether user already exists
    const existingUser = await User.findOne({
      email: normalizedEmail,
    });

    if (existingUser) {
      return res.status(409).json({
        message: "User with this email already exists",
      });
    }

    // 11. Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // 12. Create user
    const user = await User.create({
      name: trimmedName,
      email: normalizedEmail,
      password: hashedPassword,
    });

    // 13. Never send password/hash back to client
    return res.status(201).json({
      message: "User registered successfully",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
      },
    });
  } catch (error) {
    console.error("Registration error:", error);

    // Handles duplicate email if two requests
    // happen at nearly the same time.
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

    // 1. Basic input validation
    if (
      typeof email !== "string" ||
      typeof password !== "string"
    ) {
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

    // 2. Find user
    const user = await User.findOne({
      email: normalizedEmail,
    });

    // Don't reveal whether the email exists
    if (!user) {
      return res.status(401).json({
        message: "Invalid email or password",
      });
    }

    // 3. Compare entered password with hashed password
    const passwordMatches = await bcrypt.compare(
      password,
      user.password
    );

    if (!passwordMatches) {
      return res.status(401).json({
        message: "Invalid email or password",
      });
    }

    // 4. Generate JWT
    const token = jwt.sign(
      {
        userId: user._id,
      },
      process.env.JWT_SECRET,
      {
        expiresIn: process.env.JWT_EXPIRES_IN || "7d",
      }
    );

    // 5. Send token + safe user information
    return res.status(200).json({
      message: "Login successful",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
      },
    });
  } catch (error) {
    console.error("Login error:", error);

    return res.status(500).json({
      message: "Internal server error",
    });
  }
};


module.exports = {
  registerUser,
  loginUser,
};
