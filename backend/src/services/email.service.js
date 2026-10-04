const logger = require("../utils/logger");

const deliveryMode = () => {
  if (process.env.EMAIL_DELIVERY === "development") return "development";
  if (process.env.RESEND_API_KEY && process.env.EMAIL_FROM) return "provider";
  if (process.env.NODE_ENV === "production") return "unconfigured";
  return "development";
};

const sendWithResend = async ({ to, subject, text }) => {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(15000),
    body: JSON.stringify({
      from: process.env.EMAIL_FROM,
      to: [to],
      subject,
      text,
    }),
  });

  if (!response.ok) {
    throw new Error(`Email provider returned ${response.status}`);
  }
};

const sendVerificationEmail = async ({ to, name, code }) => {
  const mode = deliveryMode();
  const text = [
    `Hi ${name || "there"},`,
    "",
    `Your MindMesh verification code is ${code}.`,
    "It expires in 10 minutes.",
    "",
    "If you did not create this account, you can ignore this email.",
  ].join("\n");

  if (mode === "development") {
    logger.info("email.verification.development", {
      to,
      code,
      note: "No email was sent. This code is for local development only.",
    });
    return {
      delivered: false,
      mode: "development",
      devCode: code,
    };
  }

  if (mode === "unconfigured") {
    logger.error("email.verification.unconfigured", { to });
    return { delivered: false, mode: "failed" };
  }

  try {
    await sendWithResend({
      to,
      subject: "Your MindMesh verification code",
      text,
    });
    logger.info("email.verification.sent", { to, mode: "provider" });
    return { delivered: true, mode: "sent" };
  } catch (error) {
    logger.error("email.verification.failed", { to, message: error.message });
    return { delivered: false, mode: "failed" };
  }
};

module.exports = {
  deliveryMode,
  sendVerificationEmail,
};
