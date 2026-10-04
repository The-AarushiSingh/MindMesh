const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = "auth-verification-test-secret";
process.env.JWT_EXPIRES_IN = "1h";
process.env.MONGO_URI = "mongodb://127.0.0.1:27017/mindmesh_auth_test";
process.env.EMAIL_DELIVERY = "development";
delete process.env.RESEND_API_KEY;
delete process.env.EMAIL_FROM;

const mongoose = require("mongoose");
const app = require("../src/app");
const User = require("../src/models/User");

const request = async (baseUrl, path, { method = "GET", token, body } = {}) => {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  return { status: response.status, data };
};

test("email verification is required before a JWT is issued", async () => {
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 4000 });
  await mongoose.connection.dropDatabase();
  const server = app.listen(0);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const password = "Archive1!test";
  const email = "verify@example.com";

  try {
    const registered = await request(baseUrl, "/api/auth/register", {
      method: "POST",
      body: { name: "Verifier", email, password, emailVerified: true },
    });
    assert.equal(registered.status, 201);
    assert.equal(registered.data.user.emailVerified, false);
    assert.equal(registered.data.emailDelivery, "development");
    assert.match(registered.data.devCode, /^\d{6}$/);
    assert.equal(registered.data.token, undefined);

    const duplicate = await request(baseUrl, "/api/auth/register", {
      method: "POST",
      body: { name: "Verifier", email, password },
    });
    assert.equal(duplicate.status, 409);

    const stored = await User.findOne({ email }).select("+verificationCodeHash +password");
    assert.equal(stored.emailVerified, false);
    assert.notEqual(stored.verificationCodeHash, registered.data.devCode);
    assert.ok(stored.verificationExpiresAt > new Date());

    const unverifiedLogin = await request(baseUrl, "/api/auth/login", {
      method: "POST",
      body: { email, password },
    });
    assert.equal(unverifiedLogin.status, 403);
    assert.equal(unverifiedLogin.data.code, "EMAIL_NOT_VERIFIED");
    assert.equal(unverifiedLogin.data.token, undefined);

    const forged = jwt.sign({ userId: stored._id }, process.env.JWT_SECRET, { expiresIn: "1h" });
    const forgedMe = await request(baseUrl, "/api/auth/me", { token: forged });
    assert.equal(forgedMe.status, 403);
    assert.equal(forgedMe.data.token, undefined);

    const wrongCode = await request(baseUrl, "/api/auth/verify", {
      method: "POST",
      body: { email, code: registered.data.devCode === "000000" ? "000001" : "000000" },
    });
    assert.equal(wrongCode.status, 400);
    assert.equal(wrongCode.data.code, "OTP_INVALID");

    stored.verificationExpiresAt = new Date(Date.now() - 1000);
    await stored.save();
    const expired = await request(baseUrl, "/api/auth/verify", {
      method: "POST",
      body: { email, code: registered.data.devCode },
    });
    assert.equal(expired.status, 400);
    assert.equal(expired.data.code, "OTP_EXPIRED");

    stored.verificationExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
    stored.verificationSentAt = new Date(Date.now() - 61 * 1000);
    await stored.save();

    const resent = await request(baseUrl, "/api/auth/resend-verification", {
      method: "POST",
      body: { email },
    });
    assert.equal(resent.status, 200);
    assert.notEqual(resent.data.devCode, registered.data.devCode);

    const oldCode = await request(baseUrl, "/api/auth/verify", {
      method: "POST",
      body: { email, code: registered.data.devCode },
    });
    assert.equal(oldCode.status, 400);
    assert.equal(oldCode.data.code, "OTP_INVALID");

    const cooled = await request(baseUrl, "/api/auth/resend-verification", {
      method: "POST",
      body: { email },
    });
    assert.equal(cooled.status, 429);
    assert.equal(cooled.data.code, "RESEND_COOLDOWN");
    assert.ok(cooled.data.retryAfterSeconds > 0);

    const verified = await request(baseUrl, "/api/auth/verify", {
      method: "POST",
      body: { email, code: resent.data.devCode },
    });
    assert.equal(verified.status, 200);
    assert.equal(verified.data.emailVerified, true);

    const reused = await request(baseUrl, "/api/auth/verify", {
      method: "POST",
      body: { email, code: resent.data.devCode },
    });
    assert.equal(reused.status, 400);
    assert.equal(reused.data.code, "OTP_REUSED");

    const again = await request(baseUrl, "/api/auth/verify", {
      method: "POST",
      body: { email, code: "123456" },
    });
    assert.equal(again.data.alreadyVerified, true);

    const login = await request(baseUrl, "/api/auth/login", {
      method: "POST",
      body: { email, password },
    });
    assert.equal(login.status, 200);
    assert.ok(login.data.token);

    const me = await request(baseUrl, "/api/auth/me", { token: login.data.token });
    assert.equal(me.status, 200);
    assert.equal(me.data.user.email, email);

    const unknownResend = await request(baseUrl, "/api/auth/resend-verification", {
      method: "POST",
      body: { email: "missing@example.com" },
    });
    assert.equal(unknownResend.status, 200);
    assert.equal(unknownResend.data.devCode, undefined);
    assert.equal(unknownResend.data.alreadyVerified, undefined);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});
