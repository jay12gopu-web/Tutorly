// Isolated behavioral tests. No connection to a real MongoDB or payment provider.
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const mongoose = require("mongoose");
const { mutate, execute, validateRequest } = require("../backend/services/premiumCreditService");
const { verifySignature } = require("../backend/routes/internalCredits");
const { CREDIT_COSTS } = require("../shared/tutorly-plans");

const now = new Date("2030-01-10T00:00:00Z");
const imageUrl = "/uploads/generated/study-" + "a".repeat(32) + ".png";
const input = (overrides = {}) => ({
  user_id: 1, idempotency_key: "image:request:000001", request_hash: "b".repeat(64),
  action: "educationalImage", ...overrides
});
const account = (overrides = {}) => ({
  _id: "existing-subscription-1", authUserId: "1", userId: "existing-legacy-billing-id",
  currentPlan: "standard", premiumCreditsRemaining: 19,
  creditsResetAt: new Date("2030-02-01T00:00:00Z"), ...overrides
});
const expectCode = (promise, code) => assert.rejects(promise, (error) => error.code === code);

function fixture(accounts = [account()]) {
  let state = { accounts: structuredClone(accounts), actions: [] };
  let queue = Promise.resolve();
  let failActionSave = false;
  const session = { fixtureOnly: true };
  const match = (row, query) => Object.entries(query).every(([key, value]) =>
    value && typeof value === "object" && "$lte" in value ? row[key] <= value.$lte : row[key] === value
  );
  class Document {
    constructor(collection, data) {
      Object.defineProperty(this, "collection", { value: collection });
      Object.assign(this, structuredClone(data));
    }
    async save(options) {
      assert.equal(options.session, session, "Every write must join the debit/ledger transaction");
      if (this.collection === "actions" && failActionSave) throw new Error("Injected ledger write failure");
      const rows = state[this.collection];
      const index = rows.findIndex((row) => this.collection === "accounts"
        ? row._id === this._id
        : row.authUserId === this.authUserId && row.idempotencyKey === this.idempotencyKey);
      const value = structuredClone({ ...this });
      if (index < 0) rows.push(value);
      else rows[index] = value;
    }
  }
  const queryResult = (collection, query, many) => ({
    async session(supplied) {
      assert.equal(supplied, session, "Every read must join the transaction");
      const found = state[collection].filter((row) => match(row, query)).map((row) => new Document(collection, row));
      return many ? found : found[0] || null;
    }
  });
  class Action extends Document {
    constructor(data) { super("actions", data); }
    static findOne(query) { return queryResult("actions", query, false); }
    static find(query) { return queryResult("actions", query, true); }
  }
  const models = {
    Subscription: { findOne(query) { return queryResult("accounts", query, false); } },
    PremiumCreditAction: Action
  };
  return {
    get state() { return state; },
    failNextLedgerWrite() { failActionSave = true; },
    run(operation, data = input(), at = now) {
      // Serialize and roll back transactions in the test adapter. Actual Mongo concurrency
      // requires deployment integration testing against a replica set.
      const result = queue.then(async () => {
        const before = structuredClone(state);
        try {
          validateRequest(operation, data);
          return await mutate(operation, data, session, models, at);
        } catch (error) {
          state = before;
          throw error;
        }
      });
      queue = result.catch(() => {});
      return result;
    }
  };
}

async function main() {
  let checks = 0;
  const test = async (name, fn) => { await fn(); checks += 1; console.log("PASS " + name); };

  await test("unmapped authenticated user never gets a new allowance", async () => {
    const db = fixture([]);
    await expectCode(db.run("reserve"), "credit_account_unlinked");
    assert.equal(db.state.accounts.length, 0);
    assert.equal(db.state.actions.length, 0);
  });
  await test("reserve debits the existing balance using the shared price", async () => {
    const db = fixture();
    const result = await db.run("reserve", input({ credits: 0, remaining: 99999 }));
    assert.equal(result.remaining, 19 - CREDIT_COSTS.educationalImage.credits);
    assert.equal(db.state.accounts.length, 1);
    assert.equal(db.state.accounts[0].userId, "existing-legacy-billing-id");
    assert.equal(db.state.actions[0].credits, CREDIT_COSTS.educationalImage.credits);
  });
  await test("duplicate in-flight request and changed payload cannot debit twice", async () => {
    const db = fixture();
    await db.run("reserve");
    await expectCode(db.run("reserve"), "generation_in_progress");
    await expectCode(db.run("reserve", input({ request_hash: "c".repeat(64) })), "idempotency_conflict");
    assert.equal(db.state.accounts[0].premiumCreditsRemaining, 11);
  });
  await test("provider failure refunds once and preserves payload binding", async () => {
    const db = fixture();
    const hold = await db.run("reserve");
    const payload = input({ reservation_token: hold.reservation_token });
    assert.equal((await db.run("release", payload)).remaining, 19);
    assert.equal((await db.run("release", payload)).remaining, 19);
    await expectCode(db.run("reserve", input({ request_hash: "c".repeat(64) })), "idempotency_conflict");
  });
  await test("retry rotates the lease and rejects late old-worker settlement", async () => {
    const db = fixture();
    const first = await db.run("reserve");
    await db.run("release", input({ reservation_token: first.reservation_token }));
    const second = await db.run("reserve");
    assert.notEqual(first.reservation_token, second.reservation_token);
    const stale = input({ reservation_token: first.reservation_token, result_url: imageUrl });
    await expectCode(db.run("complete", stale), "stale_reservation");
    await expectCode(db.run("release", stale), "stale_reservation");
    const completed = await db.run("complete", input({ reservation_token: second.reservation_token, result_url: imageUrl }));
    assert.equal(completed.remaining, 11);
    assert.equal(completed.status, "completed");
  });
  await test("completed image retries return the stored result and never refund", async () => {
    const db = fixture();
    const hold = await db.run("reserve");
    const payload = input({ reservation_token: hold.reservation_token, result_url: imageUrl });
    await db.run("complete", payload);
    assert.equal((await db.run("complete", payload)).remaining, 11);
    assert.equal((await db.run("release", payload)).remaining, 11);
    const retry = await db.run("reserve");
    assert.equal(retry.status, "completed");
    assert.equal(retry.result_url, imageUrl);
    assert.equal((await db.run("status")).result_url, imageUrl);
  });
  await test("user scope isolates the same key and prevents cross-user release", async () => {
    const db = fixture([account(), account({ _id: "subscription-2", authUserId: "2", premiumCreditsRemaining: 27 })]);
    const first = await db.run("reserve");
    await expectCode(db.run("status", input({ user_id: 2 })), "credit_reservation_missing");
    const second = await db.run("reserve", input({ user_id: 2 }));
    assert.equal(second.remaining, 19);
    await expectCode(db.run("release", input({ user_id: 2, reservation_token: first.reservation_token })), "stale_reservation");
    assert.deepEqual(db.state.accounts.map((row) => row.premiumCreditsRemaining), [11, 19]);
  });
  await test("expired leases cannot complete and are recovered exactly once", async () => {
    const db = fixture();
    const first = await db.run("reserve");
    const later = new Date(now.getTime() + 16 * 60 * 1000);
    await expectCode(db.run("complete", input({ reservation_token: first.reservation_token, result_url: imageUrl }), later), "stale_reservation");
    const retry = await db.run("reserve", input(), later);
    assert.equal(retry.remaining, 11);
    assert.notEqual(retry.reservation_token, first.reservation_token);
    assert.equal(db.state.actions.length, 1);
  });
  await test("old-cycle refunds never increase a newly reset billing allowance", async () => {
    const db = fixture();
    const hold = await db.run("reserve");
    db.state.accounts[0].creditsResetAt = new Date("2030-03-01T00:00:00Z");
    db.state.accounts[0].premiumCreditsRemaining = 100;
    const release = await db.run("release", input({ reservation_token: hold.reservation_token }));
    assert.equal(release.remaining, 100);
  });
  await test("insufficient and expired accounts fail without creating a debit", async () => {
    const low = fixture([account({ premiumCreditsRemaining: 7 })]);
    await expectCode(low.run("reserve"), "insufficient_credits");
    assert.equal(low.state.actions.length, 0);
    assert.equal(low.state.accounts[0].premiumCreditsRemaining, 7);
    const expired = fixture([account({ creditsResetAt: new Date("2030-01-01T00:00:00Z") })]);
    await expectCode(expired.run("reserve"), "credit_period_expired");
    assert.equal(expired.state.accounts[0].premiumCreditsRemaining, 19);
  });
  await test("concurrent duplicate reservations under transactions debit once", async () => {
    const db = fixture();
    const results = await Promise.allSettled([db.run("reserve"), db.run("reserve")]);
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(results.find((result) => result.status === "rejected").reason.code, "generation_in_progress");
    assert.equal(db.state.accounts[0].premiumCreditsRemaining, 11);
  });
  await test("concurrent different requests cannot overspend the last credits", async () => {
    const db = fixture([account({ premiumCreditsRemaining: 8 })]);
    const results = await Promise.allSettled([
      db.run("reserve"), db.run("reserve", input({ idempotency_key: "image:request:000002" }))
    ]);
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(results.find((result) => result.status === "rejected").reason.code, "insufficient_credits");
    assert.equal(db.state.accounts[0].premiumCreditsRemaining, 0);
  });
  await test("ledger-write failure rolls back the existing account debit", async () => {
    const db = fixture();
    db.failNextLedgerWrite();
    await assert.rejects(db.run("reserve"), /Injected ledger write failure/);
    assert.equal(db.state.accounts[0].premiumCreditsRemaining, 19);
    assert.equal(db.state.actions.length, 0);
  });
  await test("transaction-unavailable deployment fails closed without a fallback", async () => {
    const original = mongoose.startSession;
    let ended = false;
    mongoose.startSession = async () => ({
      async withTransaction() { throw new Error("replica set required"); },
      async endSession() { ended = true; }
    });
    try { await assert.rejects(execute("reserve", input()), /replica set required/); }
    finally { mongoose.startSession = original; }
    assert.equal(ended, true);
  });
  await test("signature verifies exact body and rejects tampering or stale requests", async () => {
    const body = Buffer.from(JSON.stringify(input()));
    const timestamp = String(Math.floor(now.getTime() / 1000));
    const secret = "test-only-bridge-secret-not-a-production-key";
    const signature = crypto.createHmac("sha256", secret).update(timestamp + "\nreserve\n").update(body).digest("hex");
    assert.equal(verifySignature(body, timestamp, signature, secret, "reserve", now.getTime()), true);
    assert.equal(verifySignature(Buffer.from("{}"), timestamp, signature, secret, "reserve", now.getTime()), false);
    assert.equal(verifySignature(body, timestamp, signature, secret, "reserve", now.getTime() + 61000), false);
    assert.equal(verifySignature(body, timestamp, signature, "", "reserve", now.getTime()), false);
    assert.equal(verifySignature(body, timestamp, signature, secret, "release", now.getTime()), false);
  });
  await test("tool and output validation rejects unsafe action and external images", async () => {
    assert.throws(() => validateRequest("reserve", input({ user_id: "legacy-localStorage-id" })), /invalid_request/);
    assert.throws(() => validateRequest("reserve", input({ action: "grantCredits" })), /invalid_action/);
    assert.throws(() => validateRequest("complete", input({ reservation_token: "a".repeat(64), result_url: "https://attacker.example/image.png" })), /invalid_image/);
    assert.throws(() => validateRequest("reserve", input({ request_hash: "not-a-hash" })), /invalid_request/);
  });
  console.log(`${checks} isolated image credit service checks passed (MongoDB deployment not exercised).`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
