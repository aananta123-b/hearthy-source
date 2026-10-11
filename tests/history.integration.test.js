import assert from "node:assert/strict";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer as createHttpServer } from "node:http";
import { createServer } from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function getAvailablePort() {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function startApi(t, { billingMode = "", nodeEnv = "test", stripeConfigured = true } = {}) {
  const dataDirectory = await mkdtemp(path.join(tmpdir(), "hearthy-history-"));
  const port = await getAvailablePort();
  const stripeSessions = new Map();
  const stripeServer = createHttpServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = new URLSearchParams(Buffer.concat(chunks).toString());
    const send = (status, payload) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(payload));
    };

    if (req.method === "POST" && req.url === "/v1/checkout/sessions") {
      const id = `cs_test_${crypto.randomUUID().replaceAll("-", "")}`;
      const paymentIntent = `pi_${crypto.randomUUID().replaceAll("-", "")}`;
      const amount = Number(body.get("line_items[0][price_data][unit_amount]"));
      const email = body.get("customer_email");
      const months = body.get("metadata[months]");
      stripeSessions.set(id, {
        id,
        paymentIntent,
        amount,
        email,
        months,
        userId: body.get("metadata[userId]") || "",
        created: Math.floor(Date.now() / 1000),
      });
      return send(200, { id, url: `https://checkout.stripe.test/${id}` });
    }

    const sessionMatch = req.url.match(/^\/v1\/checkout\/sessions\/(cs_test_[A-Za-z0-9]+)$/);
    if (req.method === "GET" && sessionMatch) {
      const checkout = stripeSessions.get(sessionMatch[1]);
      if (!checkout) return send(404, { error: { message: "No such checkout session." } });
      return send(200, {
        id: checkout.id,
        status: "complete",
        payment_status: "paid",
        mode: "payment",
        payment_intent: checkout.paymentIntent,
        amount_total: checkout.amount,
        currency: "usd",
        customer_details: { email: checkout.email },
        metadata: { months: checkout.months, userId: checkout.userId },
      });
    }

    const paymentMatch = req.url.match(/^\/v1\/payment_intents\/(pi_[A-Za-z0-9]+)$/);
    if (req.method === "GET" && paymentMatch) {
      const checkout = [...stripeSessions.values()].find((entry) => entry.paymentIntent === paymentMatch[1]);
      if (!checkout) return send(404, { error: { message: "No such payment." } });
      return send(200, {
        id: checkout.paymentIntent,
        status: "succeeded",
        amount_received: checkout.amount,
        currency: "usd",
        metadata: { months: checkout.months, userId: checkout.userId },
        created: checkout.created,
      });
    }

    return send(404, { error: { message: "Unknown mocked Stripe endpoint." } });
  });
  stripeServer.listen(0, "127.0.0.1");
  await once(stripeServer, "listening");
  const stripePort = stripeServer.address().port;
  const processHandle = spawn(process.execPath, ["server/index.js"], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(port),
      HEARTHY_DATA_DIR: dataDirectory,
      STRIPE_SECRET_KEY: stripeConfigured ? "sk_test_mock" : "",
      STRIPE_API_BASE_URL: `http://127.0.0.1:${stripePort}/v1`,
      HEARTHY_BILLING_MODE: billingMode,
      NODE_ENV: nodeEnv,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  processHandle.stdout.setEncoding("utf8").on("data", (chunk) => { output += chunk; });
  processHandle.stderr.setEncoding("utf8").on("data", (chunk) => { output += chunk; });
  t.after(async () => {
    processHandle.kill();
    await Promise.race([once(processHandle, "exit"), new Promise((resolve) => setTimeout(resolve, 3000))]);
    await new Promise((resolve, reject) => stripeServer.close((error) => error ? reject(error) : resolve()));
    await rm(dataDirectory, { recursive: true, force: true });
  });

  const baseUrl = `http://127.0.0.1:${port}/api`;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (processHandle.exitCode !== null) throw new Error(`API process exited before startup.\n${output}`);
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) return baseUrl;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new Error(`API did not become ready.\n${output}`);
}

async function request(baseUrl, token, endpoint, { method = "GET", body, expectedStatus } = {}) {
  const response = await fetch(`${baseUrl}${endpoint}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const payload = response.status === 204 ? null : await response.json();
  if (expectedStatus !== undefined) {
    assert.equal(response.status, expectedStatus, `${method} ${endpoint}: ${payload?.error || "unexpected response"}`);
  } else {
    assert.ok(response.ok, `${method} ${endpoint} failed (${response.status}): ${payload?.error || "no error detail"}`);
  }
  return payload;
}

async function startMembership(baseUrl, token, months = 4) {
  const checkout = await request(baseUrl, token, "/billing/checkout-session", {
    method: "POST",
    body: { months },
  });
  const checkoutSessionId = new URL(checkout.checkoutUrl).pathname.slice(1);
  const membership = await request(baseUrl, token, "/billing/membership/complete", {
    method: "POST",
    body: { checkoutSessionId },
  });
  return { ...membership, checkoutSessionId };
}

test("persists a searchable audit trail for money movement and record changes", { timeout: 30_000 }, async (t) => {
  const baseUrl = await startApi(t, { billingMode: "stripe" });
  await request(baseUrl, null, "/billing/checkout-session", {
    method: "POST",
    body: { months: 6 },
    expectedStatus: 401,
  });
  const accountResponse = await request(baseUrl, null, "/auth/signup", {
    method: "POST",
    body: { name: "History Test", email: `history-${Date.now()}@example.test`, password: "test-password-long-enough" },
  });
  const token = accountResponse.token;
  assert.equal(accountResponse.user.membershipPlanMonths, 0, "account creation does not require payment");
  assert.equal(accountResponse.user.membershipExpiresAt, "", "new accounts begin without paid feature access");
  await request(baseUrl, token, `/users/${accountResponse.user.id}/trackers`, { expectedStatus: 402 });
  await request(baseUrl, token, "/billing/membership/complete", {
    method: "POST",
    body: { checkoutSessionId: "cs_test_not-a-real-paid-session" },
    expectedStatus: 402,
  });
  await request(baseUrl, token, "/billing/checkout-session", {
    method: "POST",
    body: { months: 5 },
    expectedStatus: 400,
  });
  const membership = await startMembership(baseUrl, token, 6);
  assert.equal(membership.membershipPlanMonths, 6);
  assert.equal(membership.membershipAmount, 27000, "the 6-month plan charges its fixed discounted total");
  assert.ok(Date.parse(membership.membershipExpiresAt) > Date.now());
  await request(baseUrl, token, "/billing/membership/complete", {
    method: "POST",
    body: { checkoutSessionId: membership.checkoutSessionId },
    expectedStatus: 409,
  });
  await request(baseUrl, token, `/users/${accountResponse.user.id}/trackers`);
  for (const [months, amount] of [[4, 19000], [8, 34000], [12, 48000]]) {
    const extended = await startMembership(baseUrl, token, months);
    assert.equal(extended.membershipAmount, amount, `${months}-month plan has its configured total`);
  }
  const trackerResponse = await request(baseUrl, token, "/trackers", {
    method: "POST",
    body: { userId: accountResponse.user.id, name: "Audit tracker", currency: "USD", context: "Everyday", budget: 500 },
  });
  const trackerId = trackerResponse.tracker.id;
  const route = `/trackers/${trackerId}`;
  const today = new Date().toISOString();

  const account = (await request(baseUrl, token, `${route}/accounts`, {
    method: "POST",
    body: { name: "Checking", type: "checking", currency: "USD", openingBalance: 100 },
  })).account;
  const secondAccount = (await request(baseUrl, token, `${route}/accounts`, {
    method: "POST",
    body: { name: "Savings", type: "savings", currency: "USD", openingBalance: 0 },
  })).account;

  const expense = (await request(baseUrl, token, `${route}/expenses`, {
    method: "POST",
    body: { name: "Market", amount: 35, category: "Groceries", currency: "USD", date: today, accountId: account.id },
  })).expense;
  await request(baseUrl, token, `${route}/expenses/${expense.id}`, {
    method: "PUT",
    body: { ...expense, amount: 40 },
  });
  const deletedExpense = await request(baseUrl, token, `${route}/expenses/${expense.id}`, { method: "DELETE" });
  await request(baseUrl, token, `${route}/expenses/${expense.id}/restore`, {
    method: "POST",
    body: { expense: deletedExpense.expense, deletionActivityId: "not-the-deletion-event" },
    expectedStatus: 409,
  });
  const restoredExpense = await request(baseUrl, token, `${route}/expenses/${expense.id}/restore`, {
    method: "POST",
    body: { expense: deletedExpense.expense, deletionActivityId: deletedExpense.deletionActivityId },
  });
  assert.equal(restoredExpense.expense.id, expense.id, "expense undo preserves the original ID");
  assert.equal(restoredExpense.expense.amount, 40, "expense undo preserves the latest saved details");
  await request(baseUrl, token, `${route}/expenses/${expense.id}/restore`, {
    method: "POST",
    body: { expense: deletedExpense.expense, deletionActivityId: deletedExpense.deletionActivityId },
    expectedStatus: 409,
  });
  await request(baseUrl, token, `${route}/expenses/${expense.id}`, { method: "DELETE" });
  await request(baseUrl, token, `${route}/expenses/import`, {
    method: "POST",
    body: { expenses: [{ name: "CSV purchase", amount: 12, category: "Other", currency: "USD", date: today }] },
  });

  const income = (await request(baseUrl, token, `${route}/incomes`, {
    method: "POST",
    body: { name: "Paycheck", amount: 400, currency: "USD", category: "Salary", date: today, accountId: account.id },
  })).income;
  const updatedIncome = (await request(baseUrl, token, `${route}/incomes/${income.id}`, {
    method: "PUT",
    body: { ...income, name: "Updated paycheck", amount: 450 },
  })).income;
  assert.equal(updatedIncome.name, "Updated paycheck");
  assert.equal(updatedIncome.amount, 450, "income edit persists the new amount");
  const deletedIncome = await request(baseUrl, token, `${route}/incomes/${income.id}`, { method: "DELETE" });
  const restoredIncome = await request(baseUrl, token, `${route}/incomes/${income.id}/restore`, {
    method: "POST",
    body: { record: deletedIncome.income, deletionActivityId: deletedIncome.deletionActivityId },
  });
  assert.equal(restoredIncome.income.id, income.id, "income undo preserves the original ID");
  assert.equal(restoredIncome.income.name, "Updated paycheck");
  await request(baseUrl, token, `${route}/incomes/${income.id}`, { method: "DELETE" });
  await request(baseUrl, token, `${route}/budget`, { method: "PUT", body: { budget: 600, currency: "USD" } });

  await request(baseUrl, token, `${route}/transfers`, {
    method: "POST",
    body: { fromAccountId: account.id, toAccountId: secondAccount.id, amount: 20, date: today, note: "Savings" },
  });
  const loan = (await request(baseUrl, token, `${route}/loans`, {
    method: "POST",
    body: { direction: "borrowed", person: "Alex", amount: 80, currency: "USD", dueDate: "2030-01-01", note: "Lunch" },
  })).loan;
  await request(baseUrl, token, `${route}/loans/${loan.id}/payments`, {
    method: "POST",
    body: { amount: 15, date: today },
  });

  const goal = (await request(baseUrl, token, `${route}/goals`, {
    method: "POST",
    body: { name: "Emergency fund", targetAmount: 300, currentAmount: 0, currency: "USD", targetDate: "" },
  })).goal;
  await request(baseUrl, token, `${route}/goals/${goal.id}/contributions`, { method: "POST", body: { amount: 25 } });

  const recurring = (await request(baseUrl, token, `${route}/recurring`, {
    method: "POST",
    body: { name: "Streaming", amount: 10, currency: "USD", category: "Bills & utilities", kind: "expense", frequency: "monthly", nextDue: new Date().toISOString().slice(0, 10), accountId: account.id, active: true },
  })).recurring;
  const updatedRecurring = (await request(baseUrl, token, `${route}/recurring/${recurring.id}`, {
    method: "PUT",
    body: { ...recurring, name: "Music subscription", amount: 12, frequency: "yearly" },
  })).recurring;
  assert.equal(updatedRecurring.name, "Music subscription");
  assert.equal(updatedRecurring.amount, 12, "recurring edit persists the new amount");
  assert.equal(updatedRecurring.frequency, "yearly");
  const deletedRecurring = await request(baseUrl, token, `${route}/recurring/${recurring.id}`, { method: "DELETE" });
  const restoredRecurring = await request(baseUrl, token, `${route}/recurring/${recurring.id}/restore`, {
    method: "POST",
    body: { record: deletedRecurring.recurring, deletionActivityId: deletedRecurring.deletionActivityId },
  });
  assert.equal(restoredRecurring.recurring.id, recurring.id, "recurring undo preserves the original ID");
  assert.equal(restoredRecurring.recurring.name, "Music subscription");
  await request(baseUrl, token, `${route}/recurring/${recurring.id}/pay`, { method: "POST" });
  await request(baseUrl, token, `${route}/recurring/${recurring.id}/pay`, { method: "POST" });

  const history = (await request(baseUrl, token, `${route}/history`)).activities;
  const kinds = new Set(history.map((activity) => activity.kind));
  for (const kind of ["Opening balance", "Expense", "Income", "Budget", "Transfer", "Loan", "Repayment", "Savings goal", "Goal contribution", "Recurring schedule"]) {
    assert.ok(kinds.has(kind), `Expected history to contain ${kind}`);
  }
  assert.ok(history.some((activity) => activity.kind === "Expense" && activity.action === "updated"));
  assert.ok(history.some((activity) => activity.kind === "Expense" && activity.action === "deleted"));
  assert.ok(history.some((activity) => activity.kind === "Income" && activity.action === "updated"));
  assert.ok(history.some((activity) => activity.kind === "Income" && activity.action === "deleted"));
  assert.ok(history.some((activity) => activity.title === "Music subscription" && activity.action === "updated"));
  assert.ok(history.some((activity) => activity.title === "Music subscription" && activity.detail.includes("recurring")));

  const backup = await request(baseUrl, token, `${route}/backup`);
  assert.equal(backup.history.length, history.length);
  await request(baseUrl, token, `${route}/backup`, { method: "POST", body: backup });
  const restoredHistory = (await request(baseUrl, token, `${route}/history`)).activities;
  assert.equal(restoredHistory.length, history.length, "backup restore preserves audit entries");
});

test("demo billing grants test access without charging and is disabled in production", { timeout: 30_000 }, async (t) => {
  const demoApi = await startApi(t, { billingMode: "demo" });
  assert.deepEqual(await request(demoApi, null, "/billing/config"), { demoPaymentsEnabled: true });
  const account = await request(demoApi, null, "/auth/signup", {
    method: "POST",
    body: { name: "Demo Tester", email: `demo-${Date.now()}@example.test`, password: "test-password-long-enough" },
  });
  const token = account.token;
  await request(demoApi, token, "/billing/demo/complete", {
    method: "POST",
    body: { months: 5 },
    expectedStatus: 400,
  });
  await request(demoApi, token, "/billing/checkout-session", {
    method: "POST",
    body: { months: 4 },
    expectedStatus: 409,
  });
  const membership = await request(demoApi, token, "/billing/demo/complete", {
    method: "POST",
    body: { months: 4 },
  });
  assert.equal(membership.demoPayment, true);
  assert.equal(membership.membershipPlanMonths, 4);
  assert.equal(membership.membershipAmount, 0, "simulated payments do not record real revenue");
  assert.ok(Date.parse(membership.membershipExpiresAt) > Date.now());
  await request(demoApi, token, `/users/${account.user.id}/trackers`);

  const fallbackApi = await startApi(t, { billingMode: "stripe", nodeEnv: "development", stripeConfigured: true });
  assert.deepEqual(await request(fallbackApi, null, "/billing/config"), { demoPaymentsEnabled: true });
  const fallbackAccount = await request(fallbackApi, null, "/auth/signup", {
    method: "POST",
    body: { name: "Local Tester", email: `local-${Date.now()}@example.test`, password: "test-password-long-enough" },
  });
  const fallbackMembership = await request(fallbackApi, fallbackAccount.token, "/billing/demo/complete", {
    method: "POST",
    body: { months: 6 },
  });
  assert.equal(fallbackMembership.demoPayment, true, "development defaults to demo payments even when Stripe mode is configured");
  await request(fallbackApi, fallbackAccount.token, "/billing/checkout-session", {
    method: "POST",
    body: { months: 4 },
    expectedStatus: 409,
  });

  const productionApi = await startApi(t, { billingMode: "demo", nodeEnv: "production" });
  assert.deepEqual(await request(productionApi, null, "/billing/config"), { demoPaymentsEnabled: false });
  const productionAccount = await request(productionApi, null, "/auth/signup", {
    method: "POST",
    body: { name: "Production Tester", email: `production-${Date.now()}@example.test`, password: "test-password-long-enough" },
  });
  await request(productionApi, productionAccount.token, "/billing/demo/complete", {
    method: "POST",
    body: { months: 4 },
    expectedStatus: 403,
  });
});
