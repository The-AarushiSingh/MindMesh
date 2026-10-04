const crypto = require("crypto");
const bcrypt = require("bcrypt");
const { sendVerificationEmail } = require("./email.service");

const OTP_TTL_MS = 10 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;

let dummyHashPromise;

const dummyHash = () => {
  if (!dummyHashPromise) {
    dummyHashPromise = bcrypt.hash("000000", 10);
  }
  return dummyHashPromise;
};

const generateCode = () => String(crypto.randomInt(0, 1000000)).padStart(6, "0");

const publicDelivery = (delivery) => ({
  emailDelivery: delivery.mode === "sent" ? "sent" : delivery.mode,
  ...(delivery.devCode ? { devCode: delivery.devCode } : {}),
});

const issueVerificationCode = async (user) => {
  const code = generateCode();
  user.verificationCodeHash = await bcrypt.hash(code, 10);
  user.verificationExpiresAt = new Date(Date.now() + OTP_TTL_MS);
  user.verificationSentAt = new Date();
  user.verificationAttempts = 0;
  user.verificationConsumed = false;
  await user.save();

  const delivery = await sendVerificationEmail({
    to: user.email,
    name: user.name,
    code,
  });

  return publicDelivery(delivery);
};

const resendCooldown = (user) => {
  if (!user?.verificationSentAt) return 0;
  const elapsed = Date.now() - new Date(user.verificationSentAt).getTime();
  const remaining = RESEND_COOLDOWN_MS - elapsed;
  return remaining > 0 ? Math.ceil(remaining / 1000) : 0;
};

const verifyCode = async (user, code) => {
  const normalized = typeof code === "string" ? code.trim() : "";
  const formatOk = /^\d{6}$/.test(normalized);

  if (!user || !formatOk) {
    await bcrypt.compare(normalized || "000000", await dummyHash());
    return { ok: false, status: 400, code: "OTP_INVALID", message: "That code is not valid." };
  }

  if (user.emailVerified && user.verificationConsumed) {
    const matches = user.verificationCodeHash
      ? await bcrypt.compare(normalized, user.verificationCodeHash)
      : false;
    if (matches) {
      return { ok: false, status: 400, code: "OTP_REUSED", message: "This code has already been used." };
    }
    return {
      ok: false,
      status: 200,
      code: "ALREADY_VERIFIED",
      message: "This email is already verified. You can log in.",
      alreadyVerified: true,
    };
  }

  if (user.emailVerified && !user.verificationCodeHash) {
    return {
      ok: false,
      status: 200,
      code: "ALREADY_VERIFIED",
      message: "This email is already verified. You can log in.",
      alreadyVerified: true,
    };
  }

  if (!user.verificationCodeHash || !user.verificationExpiresAt || user.verificationExpiresAt.getTime() < Date.now()) {
    return {
      ok: false,
      status: 400,
      code: "OTP_EXPIRED",
      message: "This code has expired. Request a new one.",
    };
  }

  if ((user.verificationAttempts || 0) >= MAX_ATTEMPTS) {
    return {
      ok: false,
      status: 429,
      code: "OTP_LOCKED",
      message: "Too many attempts. Request a new code.",
    };
  }

  const matches = await bcrypt.compare(normalized, user.verificationCodeHash);
  if (!matches) {
    user.verificationAttempts = (user.verificationAttempts || 0) + 1;
    await user.save();
    if (user.verificationAttempts >= MAX_ATTEMPTS) {
      return {
        ok: false,
        status: 429,
        code: "OTP_LOCKED",
        message: "Too many attempts. Request a new code.",
      };
    }
    return { ok: false, status: 400, code: "OTP_INVALID", message: "That code is not valid." };
  }

  user.emailVerified = true;
  user.verificationConsumed = true;
  user.verificationAttempts = 0;
  await user.save();

  return { ok: true, status: 200, message: "Email verified. You can log in." };
};

module.exports = {
  OTP_TTL_MS,
  RESEND_COOLDOWN_MS,
  MAX_ATTEMPTS,
  issueVerificationCode,
  resendCooldown,
  verifyCode,
};
