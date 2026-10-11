import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { promisify } from 'node:util';
import nodemailer from 'nodemailer';

const app = express();
const port = Number(process.env.PORT || 3001);
const dataDir = process.env.HEARTHY_DATA_DIR
  ? path.resolve(process.env.HEARTHY_DATA_DIR)
  : path.resolve(process.cwd(), 'server/data');
const dataFile = path.join(dataDir, 'store.json');
const adminSessionSecret = process.env.ADMIN_SESSION_SECRET;
const stripeApiBaseUrl = String(process.env.STRIPE_API_BASE_URL || 'https://api.stripe.com/v1').replace(/\/$/, '');
const billingMode = String(process.env.HEARTHY_BILLING_MODE || '').trim().toLowerCase();
const demoPaymentsEnabled = process.env.NODE_ENV !== 'production' &&
  !(process.env.NODE_ENV === 'test' && billingMode === 'stripe');
const membershipPlans = new Map([
  [4, { amount: 19000 }],
  [6, { amount: 27000 }],
  [8, { amount: 34000 }],
  [12, { amount: 48000 }],
]);
const scryptAsync = promisify(crypto.scrypt);
const passwordResetTransport = process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: String(process.env.SMTP_SECURE || '').toLowerCase() === 'true',
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    })
  : null;
const authAttempts = new Map();

function rateLimitAuth(req, res, next) {
  const key = `${req.ip}:${req.path}`;
  const now = Date.now();
  const recent = (authAttempts.get(key) || []).filter((time) => time > now - 15 * 60 * 1000);
  if (recent.length >= 8) return res.status(429).json({ error: 'Too many attempts. Try again in 15 minutes.' });
  recent.push(now);
  authAttempts.set(key, recent);
  return next();
}

async function stripeRequest(endpoint, { method = 'GET', params } = {}) {
  if (!process.env.STRIPE_SECRET_KEY) {
    const error = new Error('Stripe billing is not configured. Set STRIPE_SECRET_KEY on the server.');
    error.statusCode = 503;
    throw error;
  }
  if (process.env.NODE_ENV !== 'test') {
    const apiUrl = new URL(stripeApiBaseUrl);
    if (apiUrl.origin !== 'https://api.stripe.com' || apiUrl.pathname !== '/v1') {
      const error = new Error('Stripe API must use the official HTTPS endpoint.');
      error.statusCode = 503;
      throw error;
    }
  }

  const response = await fetch(`${stripeApiBaseUrl}${endpoint}`, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      ...(params ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
    },
    ...(params ? { body: new URLSearchParams(params) } : {}),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload?.error?.message || 'Stripe could not complete the request.');
    error.statusCode = response.status >= 400 && response.status < 500 ? 400 : 502;
    throw error;
  }
  return payload;
}

function addCalendarMonths(date, months) {
  const result = new Date(date);
  const originalDay = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const finalDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(originalDay, finalDay));
  return result;
}

async function createMembershipCheckout({ months, email, userId }) {
  const plan = membershipPlans.get(Number(months));
  if (!plan) {
    const error = new Error('Choose a valid 4, 6, 8, or 12-month Hearthy plan.');
    error.statusCode = 400;
    throw error;
  }
  const appUrl = new URL(process.env.APP_URL || `http://localhost:${process.env.CLIENT_PORT || 8443}`);
  if (!['http:', 'https:'].includes(appUrl.protocol)) throw new Error('APP_URL must use HTTP or HTTPS.');
  const baseUrl = appUrl.toString().replace(/\/$/, '');
  const metadata = {
    months: String(months),
    userId,
  };
  return stripeRequest('/checkout/sessions', {
    method: 'POST',
    params: {
      mode: 'payment',
      success_url: `${baseUrl}/?membership=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/?membership=cancelled`,
      customer_email: email,
      'line_items[0][price_data][currency]': 'usd',
      'line_items[0][price_data][product_data][name]': `Hearthy ${months}-month plan`,
      'line_items[0][price_data][product_data][description]': 'One-time payment. No automatic renewal.',
      'line_items[0][price_data][unit_amount]': String(plan.amount),
      'line_items[0][quantity]': '1',
      'metadata[months]': metadata.months,
      'metadata[userId]': metadata.userId,
      'payment_intent_data[metadata][months]': metadata.months,
      'payment_intent_data[metadata][userId]': metadata.userId,
    },
  });
}

async function verifyPaidPlan(checkoutSessionId, email, expectedUserId) {
  if (!checkoutSessionId || !/^cs_(test|live)_[A-Za-z0-9]+$/.test(checkoutSessionId)) return null;
  const session = await stripeRequest(`/checkout/sessions/${encodeURIComponent(checkoutSessionId)}`);
  const sessionEmail = String(session.customer_details?.email || session.customer_email || '').trim().toLowerCase();
  const months = Number(session.metadata?.months);
  const plan = membershipPlans.get(months);
  const paymentIntentId = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id;
  if (session.status !== 'complete' || session.payment_status !== 'paid' || session.mode !== 'payment' ||
    !plan || session.amount_total !== plan.amount || session.currency !== 'usd' ||
    sessionEmail !== email || session.metadata?.userId !== expectedUserId ||
    !paymentIntentId || !/^pi_[A-Za-z0-9]+$/.test(paymentIntentId)) return null;
  const paymentIntent = await stripeRequest(`/payment_intents/${encodeURIComponent(paymentIntentId)}`);
  if (paymentIntent.status !== 'succeeded' || paymentIntent.amount_received !== plan.amount ||
    paymentIntent.currency !== 'usd' || paymentIntent.metadata?.months !== String(months) ||
    paymentIntent.metadata?.userId !== expectedUserId) return null;
  const paidAt = new Date(Number(paymentIntent.created) * 1000);
  if (Number.isNaN(paidAt.getTime())) return null;

  return {
    checkoutSessionId: session.id,
    paymentIntentId,
    months,
    amount: plan.amount,
    currency: 'USD',
    paidAt: paidAt.toISOString(),
    expiresAt: addCalendarMonths(paidAt, months).toISOString(),
    userId: session.metadata?.userId || '',
  };
}

function createAdminToken() {
  const payload = Buffer.from(JSON.stringify({
    role: 'admin',
    expiresAt: Date.now() + 8 * 60 * 60 * 1000,
  })).toString('base64url');
  const signature = crypto.createHmac('sha256', adminSessionSecret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

function requireAdmin(req, res, next) {
  const token = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];

  if (!token || !adminSessionSecret) {
    return res.status(401).json({ error: 'Admin authentication required.' });
  }

  const [payload, signature] = token.split('.');
  if (!payload || !signature) {
    return res.status(401).json({ error: 'Invalid admin session.' });
  }

  const expectedSignature = crypto.createHmac('sha256', adminSessionSecret).update(payload).digest();
  let receivedSignature;
  try {
    receivedSignature = Buffer.from(signature, 'base64url');
  } catch {
    return res.status(401).json({ error: 'Invalid admin session.' });
  }

  if (receivedSignature.length !== expectedSignature.length || !crypto.timingSafeEqual(receivedSignature, expectedSignature)) {
    return res.status(401).json({ error: 'Invalid admin session.' });
  }

  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (session.role !== 'admin' || session.expiresAt <= Date.now()) {
      return res.status(401).json({ error: 'Admin session expired.' });
    }
  } catch {
    return res.status(401).json({ error: 'Invalid admin session.' });
  }

  return next();
}

function ensureStore() {
  fs.mkdirSync(dataDir, { recursive: true });

  if (!fs.existsSync(dataFile)) {
    fs.writeFileSync(dataFile, JSON.stringify({ users: [], trackers: [], expenses: [] }, null, 2));
  }
}

function readStore() {
  ensureStore();

  try {
    const raw = fs.readFileSync(dataFile, 'utf8');
    const parsed = JSON.parse(raw);

    return {
      users: Array.isArray(parsed.users) ? parsed.users : [],
      trackers: Array.isArray(parsed.trackers) ? parsed.trackers : [],
      expenses: Array.isArray(parsed.expenses) ? parsed.expenses : [],
      loans: Array.isArray(parsed.loans) ? parsed.loans : [],
      incomes: Array.isArray(parsed.incomes) ? parsed.incomes : [],
      recurring: Array.isArray(parsed.recurring) ? parsed.recurring : [],
      goals: Array.isArray(parsed.goals) ? parsed.goals : [],
      categories: Array.isArray(parsed.categories) ? parsed.categories : [],
      accounts: Array.isArray(parsed.accounts) ? parsed.accounts : [],
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
      passwordResets: Array.isArray(parsed.passwordResets) ? parsed.passwordResets : [],
      loanPayments: Array.isArray(parsed.loanPayments) ? parsed.loanPayments : [],
      transfers: Array.isArray(parsed.transfers) ? parsed.transfers : [],
      reconciliations: Array.isArray(parsed.reconciliations) ? parsed.reconciliations : [],
      activities: Array.isArray(parsed.activities) ? parsed.activities : [],
      historyBackfilled: Array.isArray(parsed.historyBackfilled) ? parsed.historyBackfilled : [],
      notificationPreferences: Array.isArray(parsed.notificationPreferences) ? parsed.notificationPreferences : [],
    };
  } catch {
    return { users: [], trackers: [], expenses: [], loans: [], incomes: [], recurring: [], goals: [], categories: [], accounts: [], sessions: [], passwordResets: [], loanPayments: [], transfers: [], reconciliations: [], activities: [], historyBackfilled: [], notificationPreferences: [] };
  }
}

function writeStore(store) {
  ensureStore();
  fs.writeFileSync(dataFile, JSON.stringify(store, null, 2));
}

function recordActivity(store, activity) {
  const recordedAt = new Date().toISOString();
  const entry = {
    id: crypto.randomUUID(),
    trackerId: activity.trackerId,
    sourceId: String(activity.sourceId || ''),
    kind: activity.kind,
    action: activity.action || 'recorded',
    title: String(activity.title || '').slice(0, 120),
    detail: String(activity.detail || '').slice(0, 300),
    date: new Date(activity.date || recordedAt).toISOString(),
    recordedAt,
    amount: Number(activity.amount) || 0,
    currency: String(activity.currency || '').toUpperCase(),
    flow: activity.flow || 'neutral',
  };
  store.activities.push(entry);
  return entry;
}

function recordActivityChange(store, trackerId, kind, action, entry, details) {
  const amount = Number(entry.amount) || 0;
  const currency = String(entry.currency || '').toUpperCase();
  return recordActivity(store, {
    trackerId,
    kind,
    action,
    title: entry.name || entry.person || entry.title || kind,
    sourceId: entry.id,
    detail: `${details} · original amount ${currency} ${amount.toFixed(2)}`,
    amount: kind === 'Expense' || kind === 'Income' ? amount : 0,
    currency,
    flow: kind === 'Expense' ? 'out' : kind === 'Income' ? 'in' : 'neutral',
    date: new Date().toISOString(),
  });
}

function removeDeletionActivity(store, trackerId, sourceId, activityId, kind) {
  const index = store.activities.findIndex((activity) =>
    activity.id === activityId &&
    activity.trackerId === trackerId &&
    activity.sourceId === sourceId &&
    activity.kind === kind &&
    activity.action === 'deleted',
  );
  if (index === -1) return false;
  store.activities.splice(index, 1);
  return true;
}

function sanitizeUser(user) {
  const username = String(user.username || user.name || '').trim();
  const notificationPreferences = user.notificationPreferences || {};
  return {
    id: user.id,
    name: user.name,
    username: username || 'user',
    email: user.email,
    avatar: user.avatar || '',
    bio: user.bio || '',
    createdAt: user.createdAt,
    membershipPlanMonths: Number(user.membershipPlanMonths) || 0,
    membershipExpiresAt: user.membershipExpiresAt || '',
    notificationPreferences: {
      emailReminders: notificationPreferences.emailReminders ?? true,
      browserReminders: notificationPreferences.browserReminders ?? true,
      weeklyDigest: notificationPreferences.weeklyDigest ?? true,
    },
  };
}

function mapExpense(expense) {
  return {
    id: expense.id,
    trackerId: expense.trackerId,
    name: expense.name,
    amount: Number(expense.amount) || 0,
    category: expense.category,
    currency: expense.currency,
    date: expense.date,
    icon: expense.icon,
    tone: expense.tone,
    accountId: expense.accountId || '',
    tags: Array.isArray(expense.tags) ? expense.tags : [],
    receipt: expense.receipt || '',
  };
}

function mapTracker(tracker) {
  return {
    id: tracker.id,
    userId: tracker.userId,
    name: tracker.name,
    currency: tracker.currency,
    context: tracker.context,
    destination: tracker.destination || '',
    budget: Number(tracker.budget) || 0,
    createdAt: tracker.createdAt,
  };
}

function mapLoan(loan) {
  const paidAmount = Number(loan.paidAmount) || 0;
  return {
    id: loan.id,
    trackerId: loan.trackerId,
    direction: loan.direction,
    person: loan.person,
    amount: Number(loan.amount) || 0,
    paidAmount,
    remainingAmount: Math.max(0, (Number(loan.amount) || 0) - paidAmount),
    currency: loan.currency,
    dueDate: loan.dueDate,
    note: loan.note || '',
    status: loan.status,
    createdAt: loan.createdAt,
    settledAt: loan.settledAt || null,
  };
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = await scryptAsync(password, salt, 64);
  return `scrypt$${salt}$${derivedKey.toString('hex')}`;
}

async function verifyPassword(password, storedHash) {
  if (!String(storedHash || '').startsWith('scrypt$')) return storedHash === password;
  const [, salt, expectedHex] = storedHash.split('$');
  const expected = Buffer.from(expectedHex || '', 'hex');
  const actual = await scryptAsync(password, salt, expected.length);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function createUserSession(store, user) {
  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000;
  store.sessions = store.sessions.filter((session) => session.userId !== user.id || session.expiresAt > Date.now());
  store.sessions.push({ id: crypto.randomUUID(), userId: user.id, tokenHash: hashToken(token), expiresAt });
  return { token, expiresAt };
}

function requireUser(req, res, next, allowExpiredMembership = false) {
  const token = req.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return res.status(401).json({ error: 'Sign in to access this account.' });
  const store = readStore();
  const tokenHash = hashToken(token);
  const session = store.sessions.find((entry) => entry.tokenHash === tokenHash && entry.expiresAt > Date.now());
  const user = session && store.users.find((entry) => entry.id === session.userId);
  if (!user) {
    store.sessions = store.sessions.filter((entry) => entry.tokenHash !== tokenHash);
    writeStore(store);
    return res.status(401).json({ error: 'Your session expired. Please sign in again.' });
  }
  const membershipExpiry = new Date(user.membershipExpiresAt || '').getTime();
  if (!allowExpiredMembership && (!Number.isFinite(membershipExpiry) || membershipExpiry <= Date.now())) {
    const message = user.membershipExpiresAt
      ? 'Your Hearthy plan has expired. Choose a plan to restore access.'
      : 'Choose a Hearthy plan to unlock your account features.';
    return res.status(402).json({ error: message });
  }
  req.user = sanitizeUser(user);
  req.sessionTokenHash = tokenHash;
  return next();
}

function authorizeTracker(req, res, next) {
  const store = readStore();
  if (req.method === 'POST' && req.path === '/') {
    if (req.body?.userId !== req.user.id) return res.status(403).json({ error: 'You can only create a tracker for your own account.' });
    return next();
  }
  const trackerId = req.params.trackerId || req.params.id;
  const tracker = store.trackers.find((entry) => entry.id === trackerId);
  if (!tracker) return res.status(404).json({ error: 'Tracker not found.' });
  if (tracker.userId !== req.user.id) return res.status(403).json({ error: 'You cannot access another user’s tracker.' });
  return next();
}

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '12mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, name: 'hearthy-api' });
});

app.get('/api/billing/config', (_req, res) => {
  res.json({ demoPaymentsEnabled });
});

app.post('/api/billing/checkout-session', rateLimitAuth, (req, res, next) => requireUser(req, res, next, true), async (req, res) => {
  if (demoPaymentsEnabled) return res.status(409).json({ error: 'Demo billing is enabled. Use the demo payment option instead.' });
  const months = Number(req.body?.months);
  if (!membershipPlans.has(months)) return res.status(400).json({ error: 'Choose a valid 4, 6, 8, or 12-month plan.' });

  try {
    const session = await createMembershipCheckout({ months, email: req.user.email, userId: req.user.id });
    if (!session.url || !session.id) throw new Error('Stripe returned an incomplete checkout session.');
    return res.json({ checkoutUrl: session.url });
  } catch (error) {
    console.error('Unable to start Stripe checkout.', error);
    return res.status(error.statusCode || 502).json({
      error: error.statusCode === 503 ? error.message : 'Unable to start secure checkout. Please try again.',
    });
  }
});

app.post('/api/billing/demo/complete', rateLimitAuth, (req, res, next) => requireUser(req, res, next, true), (req, res) => {
  if (!demoPaymentsEnabled) return res.status(403).json({ error: 'Demo payments are not enabled on this server.' });
  const months = Number(req.body?.months);
  const plan = membershipPlans.get(months);
  if (!plan) return res.status(400).json({ error: 'Choose a valid 4, 6, 8, or 12-month plan.' });

  const store = readStore();
  const user = store.users.find((entry) => entry.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'Account not found.' });

  const paidAt = new Date();
  const currentExpiry = new Date(user.membershipExpiresAt || 0);
  const startsAt = currentExpiry > paidAt ? currentExpiry : paidAt;
  user.membershipPlanMonths = months;
  user.membershipAmount = 0;
  user.membershipCurrency = 'USD';
  user.membershipPaidAt = '';
  user.membershipExpiresAt = addCalendarMonths(startsAt, months).toISOString();
  user.membershipPayments = [...(user.membershipPayments || []), {
    demoPaymentId: crypto.randomUUID(),
    paymentMethod: 'demo',
    demo: true,
    months,
    amount: 0,
    planAmount: plan.amount,
    currency: 'USD',
    paidAt: paidAt.toISOString(),
  }];
  writeStore(store);
  return res.json({
    membershipExpiresAt: user.membershipExpiresAt,
    membershipPlanMonths: user.membershipPlanMonths,
    membershipAmount: user.membershipAmount,
    demoPayment: true,
  });
});

app.post('/api/billing/membership/complete', (req, res, next) => requireUser(req, res, next, true), async (req, res) => {
  try {
    const store = readStore();
    const user = store.users.find((entry) => entry.id === req.user.id);
    if (!user) return res.status(404).json({ error: 'Account not found.' });
    const payment = await verifyPaidPlan(String(req.body?.checkoutSessionId || ''), user.email, user.id);
    if (!payment) return res.status(402).json({ error: 'The selected plan payment could not be verified.' });
    if (store.users.some((entry) => (entry.membershipPayments || []).some((saved) =>
      saved.checkoutSessionId === payment.checkoutSessionId || saved.paymentIntentId === payment.paymentIntentId))) {
      return res.status(409).json({ error: 'This plan payment has already been applied.' });
    }
    const currentExpiry = new Date(user.membershipExpiresAt || 0);
    const paidAt = new Date(payment.paidAt);
    const startsAt = currentExpiry > paidAt ? currentExpiry : paidAt;
    user.membershipPlanMonths = payment.months;
    user.membershipAmount = payment.amount;
    user.membershipCurrency = payment.currency;
    user.membershipPaidAt = payment.paidAt;
    user.membershipExpiresAt = addCalendarMonths(startsAt, payment.months).toISOString();
    user.membershipPayments = [...(user.membershipPayments || []), {
      checkoutSessionId: payment.checkoutSessionId,
      paymentIntentId: payment.paymentIntentId,
      months: payment.months,
      amount: payment.amount,
      currency: payment.currency,
      paidAt: payment.paidAt,
    }];
    writeStore(store);
    return res.json({
      membershipExpiresAt: user.membershipExpiresAt,
      membershipPlanMonths: user.membershipPlanMonths,
      membershipAmount: user.membershipAmount,
    });
  } catch (error) {
    console.error('Unable to verify membership payment.', error);
    return res.status(error.statusCode || 502).json({
      error: error.statusCode === 503 ? error.message : 'Unable to verify your payment. Please try again.',
    });
  }
});

app.post('/api/auth/signup', rateLimitAuth, (req, res) => {
  const { name, email, password } = req.body || {};
  void (async () => {
    if (!name || !String(name).trim() || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim()) || !password || String(password).length < 12) {
      return res.status(400).json({ error: 'Provide a name, valid email, and password with at least 12 characters.' });
    }
    const store = readStore();
    const normalizedEmail = String(email).trim().toLowerCase();
    if (store.users.some((user) => user.email.toLowerCase() === normalizedEmail)) return res.status(409).json({ error: 'An account with this email already exists.' });
    const safeName = String(name).trim().slice(0, 100);
    const generatedUsername = safeName.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 24) || 'user';
    const user = {
      id: crypto.randomUUID(),
      name: safeName,
      username: generatedUsername,
      email: normalizedEmail,
      avatar: '',
      bio: '',
      passwordHash: await hashPassword(String(password)),
      notificationPreferences: {
        emailReminders: true,
        browserReminders: true,
        weeklyDigest: true,
      },
      membershipPlanMonths: 0,
      membershipAmount: 0,
      membershipCurrency: 'USD',
      membershipPaidAt: '',
      membershipExpiresAt: '',
      membershipPayments: [],
      createdAt: new Date().toISOString(),
    };
    store.users.push(user);
    const session = createUserSession(store, user);
    writeStore(store);
    return res.status(201).json({ user: sanitizeUser(user), ...session });
  })().catch((error) => {
    console.error('Unable to create account.', error);
    if (!res.headersSent) res.status(500).json({ error: 'Unable to create account.' });
  });
});

app.post('/api/auth/login', rateLimitAuth, async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }
  const store = readStore();
  const user = store.users.find((entry) => entry.email.toLowerCase() === String(email).trim().toLowerCase());
  if (!user || !await verifyPassword(String(password), user.passwordHash ?? user.password)) return res.status(401).json({ error: 'Incorrect email or password.' });
  if (!user.passwordHash) {
    user.passwordHash = await hashPassword(String(password));
    delete user.password;
  }
  const session = createUserSession(store, user);
  writeStore(store);
  return res.json({ user: sanitizeUser(user), ...session });
});

app.post('/api/auth/logout', (req, res, next) => requireUser(req, res, next, true), (req, res) => {
  const store = readStore();
  store.sessions = store.sessions.filter((session) => session.tokenHash !== req.sessionTokenHash);
  writeStore(store);
  return res.status(204).end();
});

app.post('/api/auth/password-reset/request', rateLimitAuth, async (req, res) => {
  if (!passwordResetTransport) return res.status(503).json({ error: 'Password reset email is not configured. Set SMTP_HOST, SMTP_USER, SMTP_PASS, and SMTP_FROM.' });
  const email = String(req.body?.email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
  const store = readStore();
  const user = store.users.find((entry) => entry.email.toLowerCase() === email);
  if (user) {
    const rawToken = crypto.randomBytes(32).toString('base64url');
    store.passwordResets = store.passwordResets.filter((entry) => entry.userId !== user.id);
    store.passwordResets.push({ id: crypto.randomUUID(), userId: user.id, tokenHash: hashToken(rawToken), expiresAt: Date.now() + 30 * 60 * 1000 });
    writeStore(store);
    const appUrl = String(process.env.APP_URL || 'http://localhost:8443').replace(/\/$/, '');
    await passwordResetTransport.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: user.email,
      subject: 'Reset your Hearthy password',
      text: `Use this one-time link within 30 minutes to reset your Hearthy password: ${appUrl}/?reset=${encodeURIComponent(rawToken)}`,
    });
  }
  return res.json({ message: 'If an account exists for that email, a password reset link has been sent.' });
});

app.post('/api/auth/password-reset/complete', async (req, res) => {
  const token = String(req.body?.token || '');
  const password = String(req.body?.password || '');
  if (password.length < 12) return res.status(400).json({ error: 'Choose a password with at least 12 characters.' });
  const store = readStore();
  const tokenHash = hashToken(token);
  const reset = store.passwordResets.find((entry) => entry.tokenHash === tokenHash && entry.expiresAt > Date.now());
  if (!reset) return res.status(400).json({ error: 'This reset link is invalid or expired. Request a new one.' });
  const user = store.users.find((entry) => entry.id === reset.userId);
  if (!user) return res.status(400).json({ error: 'This reset link is invalid or expired. Request a new one.' });
  user.passwordHash = await hashPassword(password);
  delete user.password;
  store.passwordResets = store.passwordResets.filter((entry) => entry.userId !== user.id);
  store.sessions = store.sessions.filter((entry) => entry.userId !== user.id);
  writeStore(store);
  return res.json({ message: 'Password updated. Sign in with your new password.' });
});

app.post('/api/admin/login', (req, res) => {
  const username = String(req.body?.username || '');
  const password = String(req.body?.password || '');
  const configuredUsername = process.env.ADMIN_USERNAME;
  const configuredPassword = process.env.ADMIN_PASSWORD;

  if (!configuredUsername || !configuredPassword || !adminSessionSecret) {
    return res.status(503).json({ error: 'Admin access is not configured on this server.' });
  }

  const usernameMatches = username === configuredUsername;
  const passwordMatches = password === configuredPassword;
  if (!usernameMatches || !passwordMatches) {
    return res.status(401).json({ error: 'Incorrect admin username or password.' });
  }

  return res.json({ token: createAdminToken() });
});

app.get('/api/admin/overview', requireAdmin, (_req, res) => {
  const store = readStore();
  const trackersByUser = new Map();
  const expensesByTracker = new Map();
  const currencyTotals = new Map();

  for (const expense of store.expenses) {
    const list = expensesByTracker.get(expense.trackerId) || [];
    list.push(expense);
    expensesByTracker.set(expense.trackerId, list);
    const currency = String(expense.currency || 'USD').toUpperCase();
    currencyTotals.set(currency, (currencyTotals.get(currency) || 0) + Number(expense.amount || 0));
  }

  for (const tracker of store.trackers) {
    const list = trackersByUser.get(tracker.userId) || [];
    const expenses = expensesByTracker.get(tracker.id) || [];
    list.push({
      id: tracker.id,
      name: tracker.name,
      currency: tracker.currency,
      budget: Number(tracker.budget) || 0,
      expenseCount: expenses.length,
      totalExpense: expenses.reduce((total, expense) => total + Number(expense.amount || 0), 0),
    });
    trackersByUser.set(tracker.userId, list);
  }

  const users = store.users.map((user) => ({
    id: user.id,
    name: user.name,
    email: user.email,
    createdAt: user.createdAt,
    trackers: trackersByUser.get(user.id) || [],
  }));

  return res.json({
    totalUsers: users.length,
    totalTrackers: store.trackers.length,
    totalExpenses: store.expenses.length,
    amountByCurrency: Object.fromEntries(currencyTotals),
    users,
    recentExpenses: store.expenses
      .slice()
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 25)
      .map((expense) => {
        const tracker = store.trackers.find((entry) => entry.id === expense.trackerId);
        const user = store.users.find((entry) => entry.id === tracker?.userId);
        return {
          id: expense.id,
          trackerId: expense.trackerId,
          trackerName: tracker?.name || '',
          userName: user?.name || '',
          userEmail: user?.email || '',
          name: expense.name,
          amount: Number(expense.amount) || 0,
          currency: expense.currency,
          category: expense.category,
          date: expense.date,
        };
      }),
  });
});

app.use('/api/trackers', requireUser);
app.use('/api/trackers/:trackerId', authorizeTracker);

function backfillTrackerHistory(store, trackerId) {
  if (store.historyBackfilled.includes(trackerId)) return;
  const exists = (kind, sourceId) => store.activities.some((activity) =>
    activity.trackerId === trackerId && activity.kind === kind && activity.sourceId === sourceId && activity.action === 'recorded');
  const addIfMissing = (kind, sourceId, title, detail, date, amount, currency, flow) => {
    if (exists(kind, sourceId)) return;
    recordActivity(store, { trackerId, sourceId, kind, title, detail, date, amount, currency, flow });
  };

  for (const expense of store.expenses.filter((entry) => entry.trackerId === trackerId)) {
    addIfMissing('Expense', expense.id, expense.name, expense.category, expense.date, expense.amount, expense.currency, 'out');
  }
  for (const income of store.incomes.filter((entry) => entry.trackerId === trackerId)) {
    addIfMissing('Income', income.id, income.name, income.category, income.date, income.amount, income.currency, 'in');
  }
  for (const transfer of store.transfers.filter((entry) => entry.trackerId === trackerId)) {
    const from = store.accounts.find((account) => account.id === transfer.fromAccountId)?.name || 'Account';
    const to = store.accounts.find((account) => account.id === transfer.toAccountId)?.name || 'Account';
    addIfMissing('Transfer', transfer.id, 'Account transfer', `${from} to ${to}${transfer.note ? ` · ${transfer.note}` : ''}`, transfer.date, transfer.amount, transfer.currency, 'transfer');
  }
  for (const loan of store.loans.filter((entry) => entry.trackerId === trackerId)) {
    addIfMissing('Loan', loan.id, loan.direction === 'borrowed' ? `Borrowed from ${loan.person}` : `Lent to ${loan.person}`, loan.note || 'Money lent or borrowed', loan.createdAt, loan.amount, loan.currency, loan.direction === 'borrowed' ? 'in' : 'out');
  }
  for (const payment of store.loanPayments.filter((entry) => entry.trackerId === trackerId)) {
    const loan = store.loans.find((entry) => entry.id === payment.loanId);
    if (!loan) continue;
    addIfMissing('Repayment', payment.id, loan.direction === 'borrowed' ? `Repayment to ${loan.person}` : `Repayment from ${loan.person}`, payment.note || (loan.direction === 'borrowed' ? 'Loan repayment' : 'Repayment received'), payment.date, payment.amount, loan.currency, loan.direction === 'borrowed' ? 'out' : 'in');
  }
  for (const goal of store.goals.filter((entry) => entry.trackerId === trackerId)) {
    addIfMissing('Savings goal', goal.id, goal.name, 'Savings goal created', goal.createdAt, 0, goal.currency, 'neutral');
    for (const contribution of Array.isArray(goal.contributions) ? goal.contributions : []) {
      addIfMissing('Goal contribution', contribution.id, goal.name, 'Savings goal contribution', contribution.date, contribution.amount, goal.currency, 'transfer');
    }
  }
  for (const recurring of store.recurring.filter((entry) => entry.trackerId === trackerId)) {
    addIfMissing('Recurring schedule', recurring.id, recurring.name, `${recurring.kind} · ${recurring.frequency} schedule`, recurring.createdAt, 0, recurring.currency, 'neutral');
  }
  for (const account of store.accounts.filter((entry) => entry.trackerId === trackerId && Number(entry.openingBalance) !== 0)) {
    addIfMissing('Opening balance', account.id, `${account.name} opening balance`, 'Starting account balance', account.createdAt, Math.abs(Number(account.openingBalance)), account.currency, Number(account.openingBalance) > 0 ? 'in' : 'out');
  }
  for (const reconciliation of store.reconciliations.filter((entry) => entry.trackerId === trackerId)) {
    const account = store.accounts.find((entry) => entry.id === reconciliation.accountId);
    if (Number(reconciliation.adjustment) !== 0) {
      addIfMissing('Reconciliation', reconciliation.id, `${account?.name || 'Account'} balance adjustment`, reconciliation.note || 'Account reconciliation', reconciliation.date, Math.abs(Number(reconciliation.adjustment)), account?.currency || 'USD', Number(reconciliation.adjustment) > 0 ? 'in' : 'out');
    }
  }
  store.historyBackfilled.push(trackerId);
  writeStore(store);
}

app.get('/api/trackers/:trackerId/history', (req, res) => {
  const { trackerId } = req.params;
  const store = readStore();
  backfillTrackerHistory(store, trackerId);
  const activities = store.activities
    .filter((activity) => activity.trackerId === trackerId)
    .sort((first, second) => {
      const firstTime = Date.parse(first.date);
      const secondTime = Date.parse(second.date);
      const dateOrder = (Number.isNaN(secondTime) ? 0 : secondTime) - (Number.isNaN(firstTime) ? 0 : firstTime);
      if (dateOrder) return dateOrder;
      return Date.parse(second.recordedAt || second.date) - Date.parse(first.recordedAt || first.date);
    });
  return res.json({ activities });
});
app.use('/api/users/:userId', requireUser, (req, res, next) => {
  if (req.params.userId !== req.user.id) return res.status(403).json({ error: 'You cannot access another user’s account.' });
  return next();
});

app.get('/api/users/:userId/profile', (req, res) => {
  const { userId } = req.params;
  const store = readStore();
  const user = store.users.find((entry) => entry.id === userId);

  if (!user) {
    return res.status(404).json({ error: 'User not found.' });
  }

  return res.json({ user: sanitizeUser(user) });
});

app.put('/api/users/:userId/profile', (req, res) => {
  const { userId } = req.params;
  const { name, username, bio, avatar, notificationPreferences } = req.body || {};
  const store = readStore();
  const user = store.users.find((entry) => entry.id === userId);

  if (!user) {
    return res.status(404).json({ error: 'User not found.' });
  }

  const safeName = String(name || user.name || '').trim();
  if (safeName) user.name = safeName.slice(0, 100);

  const nextUsername = String(username || user.username || '').trim();
  if (nextUsername) {
    const formattedUsername = nextUsername.replace(/\s+/g, '').slice(0, 24);
    if (!/^[a-zA-Z0-9._-]{3,24}$/.test(formattedUsername)) {
      return res.status(400).json({ error: 'Username can only use letters, numbers, periods, dashes, or underscores and must be 3-24 characters long.' });
    }
    user.username = formattedUsername;
  }

  if (typeof bio === 'string') user.bio = bio.slice(0, 280);
  if (typeof avatar === 'string') user.avatar = avatar.slice(0, 8_000);

  if (notificationPreferences && typeof notificationPreferences === 'object') {
    user.notificationPreferences = {
      emailReminders: Boolean(notificationPreferences.emailReminders ?? true),
      browserReminders: Boolean(notificationPreferences.browserReminders ?? true),
      weeklyDigest: Boolean(notificationPreferences.weeklyDigest ?? true),
    };
  }

  writeStore(store);
  return res.json({ user: sanitizeUser(user) });
});

app.put('/api/users/:userId/password', async (req, res) => {
  const { userId } = req.params;
  const { currentPassword, newPassword } = req.body || {};
  const store = readStore();
  const user = store.users.find((entry) => entry.id === userId);

  if (!user) {
    return res.status(404).json({ error: 'User not found.' });
  }

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current password and new password are required.' });
  }

  if (!await verifyPassword(String(currentPassword), user.passwordHash ?? user.password)) {
    return res.status(401).json({ error: 'Your current password is incorrect.' });
  }

  if (String(newPassword).length < 12) {
    return res.status(400).json({ error: 'Choose a password with at least 12 characters.' });
  }

  user.passwordHash = await hashPassword(String(newPassword));
  delete user.password;
  writeStore(store);
  return res.json({ message: 'Password updated.' });
});

app.get('/api/users/:userId/trackers', (req, res) => {
  const { userId } = req.params;
  const store = readStore();

  const trackers = store.trackers
    .filter((tracker) => tracker.userId === userId)
    .map(mapTracker)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return res.json({ trackers });
});

app.post('/api/trackers', (req, res) => {
  const { userId, name, currency, context, destination, budget } = req.body || {};
  const parsedBudget = budget === undefined ? 0 : Number(budget);

  if (!userId || !name || !currency || !context) {
    return res.status(400).json({ error: 'Tracker details are incomplete.' });
  }
  if (!Number.isFinite(parsedBudget) || parsedBudget < 0) {
    return res.status(400).json({ error: 'Budget must be a valid non-negative amount.' });
  }
  if (userId !== req.user.id) {
    return res.status(403).json({ error: 'You can only create a tracker for your own account.' });
  }

  const store = readStore();
  const userExists = store.users.some((user) => user.id === userId);
  if (!userExists) {
    return res.status(404).json({ error: 'User not found.' });
  }

  const tracker = {
    id: crypto.randomUUID(),
    userId,
    name: String(name).trim(),
    currency: String(currency).toUpperCase(),
    context: String(context),
    destination: String(destination || ''),
    budget: parsedBudget,
    createdAt: new Date().toISOString(),
  };

  store.trackers.push(tracker);
  writeStore(store);

  return res.status(201).json({ tracker: mapTracker(tracker) });
});

app.get('/api/trackers/:trackerId', (req, res) => {
  const { trackerId } = req.params;
  const store = readStore();
  const tracker = store.trackers.find((entry) => entry.id === trackerId);

  if (!tracker) {
    return res.status(404).json({ error: 'Tracker not found.' });
  }

  return res.json({ tracker: mapTracker(tracker) });
});

app.put('/api/trackers/:trackerId/budget', (req, res) => {
  const { trackerId } = req.params;
  const { budget, currency } = req.body || {};
  const parsedBudget = Number(budget);

  if (!Number.isFinite(parsedBudget) || parsedBudget < 0) {
    return res.status(400).json({ error: 'A valid budget is required.' });
  }
  if (currency !== undefined && !/^[A-Z]{3}$/.test(String(currency).toUpperCase())) {
    return res.status(400).json({ error: 'A valid three-letter currency code is required.' });
  }

  const store = readStore();
  const tracker = store.trackers.find((entry) => entry.id === trackerId);

  if (!tracker) {
    return res.status(404).json({ error: 'Tracker not found.' });
  }

  const previousBudget = Number(tracker.budget) || 0;
  const previousCurrency = tracker.currency;
  tracker.budget = parsedBudget;
  if (currency !== undefined) tracker.currency = String(currency).toUpperCase();
  if (previousBudget !== parsedBudget || (currency !== undefined && previousCurrency !== tracker.currency)) {
    recordActivity(store, {
      trackerId,
      kind: 'Budget',
      action: 'updated',
      title: 'Budget updated',
      detail: `${previousCurrency} ${previousBudget.toFixed(2)} → ${tracker.currency} ${parsedBudget.toFixed(2)}`,
      amount: 0,
      currency: tracker.currency,
    });
  }
  writeStore(store);

  return res.json({ tracker: mapTracker(tracker) });
});

app.get('/api/trackers/:trackerId/expenses', (req, res) => {
  const { trackerId } = req.params;
  const store = readStore();

  const expenses = store.expenses
    .filter((expense) => expense.trackerId === trackerId)
    .map(mapExpense)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return res.json({ expenses });
});

app.post('/api/trackers/:trackerId/expenses', (req, res) => {
  const { trackerId } = req.params;
  const { name, amount, category, currency, date, icon, tone, accountId, tags, receipt } = req.body || {};
  const parsedAmount = Number(amount);
  const parsedDate = date ? new Date(date) : new Date();

  if (!name || !String(name).trim() || !category || !currency || !Number.isFinite(parsedAmount) || parsedAmount <= 0 || Number.isNaN(parsedDate.getTime())) {
    return res.status(400).json({ error: 'Expense details are incomplete.' });
  }
  if (receipt && (typeof receipt !== 'string' || receipt.length > 2_500_000 || !/^data:image\/(png|jpeg|webp);base64,/.test(receipt))) {
    return res.status(400).json({ error: 'Receipt must be a supported image smaller than 2 MB.' });
  }

  const store = readStore();
  const trackerExists = store.trackers.some((entry) => entry.id === trackerId);

  if (!trackerExists) {
    return res.status(404).json({ error: 'Tracker not found.' });
  }
  if (accountId && !readStore().accounts.some((account) => account.id === accountId && account.trackerId === trackerId)) {
    return res.status(400).json({ error: 'Select a valid account.' });
  }

  const expense = {
    id: crypto.randomUUID(),
    trackerId,
    name: String(name).trim(),
    amount: parsedAmount,
    category: String(category),
    currency: String(currency).toUpperCase(),
    date: parsedDate.toISOString(),
    icon: icon || 'wallet',
    tone: tone || 'sage',
    accountId: accountId || '',
    tags: Array.isArray(tags) ? tags.map((tag) => String(tag).trim()).filter(Boolean).slice(0, 20) : [],
    receipt: typeof receipt === 'string' && /^data:image\/(png|jpeg|webp);base64,/.test(receipt) ? receipt : '',
  };

  store.expenses.push(expense);
  recordActivity(store, {
    trackerId,
    sourceId: expense.id,
    kind: 'Expense',
    title: expense.name,
    detail: expense.category,
    date: expense.date,
    amount: expense.amount,
    currency: expense.currency,
    flow: 'out',
  });
  writeStore(store);

  return res.status(201).json({ expense: mapExpense(expense) });
});

app.post('/api/trackers/:trackerId/expenses/import', (req, res) => {
  const { trackerId } = req.params;
  const { expenses } = req.body || {};

  if (!Array.isArray(expenses) || expenses.length === 0 || expenses.length > 500) {
    return res.status(400).json({ error: 'Import between 1 and 500 expenses at a time.' });
  }

  const store = readStore();
  if (!store.trackers.some((entry) => entry.id === trackerId)) {
    return res.status(404).json({ error: 'Tracker not found.' });
  }

  const importedExpenses = [];
  for (const [index, entry] of expenses.entries()) {
    const name = String(entry?.name || '').trim();
    const category = String(entry?.category || '').trim();
    const currency = String(entry?.currency || '').toUpperCase();
    const amount = Number(entry?.amount);
    const date = new Date(entry?.date);
    const accountId = String(entry?.accountId || '');

    if (!name || name.length > 100 || !category || category.length > 60 ||
      !Number.isFinite(amount) || amount <= 0 || !/^[A-Z]{3}$/.test(currency) ||
      Number.isNaN(date.getTime())) {
      return res.status(400).json({ error: `Expense row ${index + 1} contains invalid details.` });
    }
    if (accountId && !store.accounts.some((account) => account.id === accountId && account.trackerId === trackerId)) {
      return res.status(400).json({ error: `Expense row ${index + 1} has an account that does not belong to this tracker.` });
    }

    importedExpenses.push({
      id: crypto.randomUUID(),
      trackerId,
      name,
      amount,
      category,
      currency,
      date: date.toISOString(),
      icon: 'wallet',
      tone: 'sage',
      accountId,
      tags: Array.isArray(entry.tags) ? entry.tags.map((tag) => String(tag).trim()).filter(Boolean).slice(0, 20) : [],
      receipt: '',
    });
  }

  store.expenses.push(...importedExpenses);
  for (const expense of importedExpenses) {
    recordActivity(store, {
      trackerId,
      sourceId: expense.id,
      kind: 'Expense',
      title: expense.name,
      detail: `${expense.category} · imported`,
      date: expense.date,
      amount: expense.amount,
      currency: expense.currency,
      flow: 'out',
    });
  }
  writeStore(store);
  return res.status(201).json({ expenses: importedExpenses.map(mapExpense) });
});

app.put('/api/trackers/:trackerId/expenses/:expenseId', (req, res) => {
  const { trackerId, expenseId } = req.params;
  const { name, amount, category, currency, date, icon, tone, accountId, tags, receipt } = req.body || {};
  const parsedAmount = Number(amount);
  const parsedDate = new Date(date);

  if (!name || !String(name).trim() || !category || !currency || !Number.isFinite(parsedAmount) || parsedAmount <= 0 || Number.isNaN(parsedDate.getTime())) {
    return res.status(400).json({ error: 'Provide a valid name, positive amount, category, currency, and date.' });
  }
  if (receipt && (typeof receipt !== 'string' || receipt.length > 2_500_000 || !/^data:image\/(png|jpeg|webp);base64,/.test(receipt))) {
    return res.status(400).json({ error: 'Receipt must be a supported image smaller than 2 MB.' });
  }

  const store = readStore();
  const expense = store.expenses.find((entry) => entry.id === expenseId && entry.trackerId === trackerId);

  if (!expense) {
    return res.status(404).json({ error: 'Expense not found.' });
  }
  if (accountId && !store.accounts.some((account) => account.id === accountId && account.trackerId === trackerId)) {
    return res.status(400).json({ error: 'Select a valid account.' });
  }

  const previousExpense = { ...expense };
  Object.assign(expense, {
    name: String(name).trim(),
    amount: parsedAmount,
    category: String(category),
    currency: String(currency).toUpperCase(),
    date: parsedDate.toISOString(),
    icon: icon || 'wallet',
    tone: tone || 'sage',
    accountId: accountId || '',
    tags: Array.isArray(tags) ? tags.map((tag) => String(tag).trim()).filter(Boolean).slice(0, 20) : [],
    receipt: typeof receipt === 'string' && /^data:image\/(png|jpeg|webp);base64,/.test(receipt) ? receipt : '',
  });
  recordActivityChange(store, trackerId, 'Expense', 'updated', expense,
    `Updated from ${previousExpense.currency} ${Number(previousExpense.amount).toFixed(2)} (${previousExpense.category}) to ${expense.currency} ${Number(expense.amount).toFixed(2)} (${expense.category})`);
  writeStore(store);

  return res.json({ expense: mapExpense(expense) });
});

app.delete('/api/trackers/:trackerId/expenses/:expenseId', (req, res) => {
  const { trackerId, expenseId } = req.params;
  const store = readStore();
  const expenseIndex = store.expenses.findIndex((entry) => entry.id === expenseId && entry.trackerId === trackerId);

  if (expenseIndex === -1) {
    return res.status(404).json({ error: 'Expense not found.' });
  }

  const [expense] = store.expenses.splice(expenseIndex, 1);
  const deletionActivity = recordActivityChange(store, trackerId, 'Expense', 'deleted', expense, 'Expense deleted');
  writeStore(store);

  return res.json({ expense: mapExpense(expense), deletionActivityId: deletionActivity.id });
});

app.post('/api/trackers/:trackerId/expenses/:expenseId/restore', (req, res) => {
  const { trackerId, expenseId } = req.params;
  const store = readStore();
  if (!store.trackers.some((entry) => entry.id === trackerId)) return res.status(404).json({ error: 'Tracker not found.' });
  if (store.expenses.some((entry) => entry.id === expenseId && entry.trackerId === trackerId)) {
    return res.status(409).json({ error: 'This expense already exists and cannot be restored twice.' });
  }

  const body = req.body || {};
  const { name, amount, category, currency, date, icon, tone, accountId, tags, receipt } = body.expense || {};
  const parsedAmount = Number(amount);
  const parsedDate = new Date(date);
  if (!name || !String(name).trim() || !category || !currency || !Number.isFinite(parsedAmount) || parsedAmount <= 0 || Number.isNaN(parsedDate.getTime())) {
    return res.status(400).json({ error: 'The deleted expense snapshot is invalid.' });
  }
  if (accountId && !store.accounts.some((account) => account.id === accountId && account.trackerId === trackerId)) {
    return res.status(400).json({ error: 'The original account no longer exists in this tracker.' });
  }
  if (receipt && (typeof receipt !== 'string' || receipt.length > 2_500_000 || !/^data:image\/(png|jpeg|webp);base64,/.test(receipt))) {
    return res.status(400).json({ error: 'The saved receipt is invalid.' });
  }
  if (!removeDeletionActivity(store, trackerId, expenseId, body.deletionActivityId, 'Expense')) {
    return res.status(409).json({ error: 'The deletion can no longer be undone.' });
  }

  const expense = {
    id: expenseId,
    trackerId,
    name: String(name).trim(),
    amount: parsedAmount,
    category: String(category),
    currency: String(currency).toUpperCase(),
    date: parsedDate.toISOString(),
    icon: icon || 'wallet',
    tone: tone || 'sage',
    accountId: accountId || '',
    tags: Array.isArray(tags) ? tags.map((tag) => String(tag).trim()).filter(Boolean).slice(0, 20) : [],
    receipt: receipt || '',
  };
  store.expenses.push(expense);
  writeStore(store);
  return res.status(201).json({ expense: mapExpense(expense) });
});

app.get('/api/trackers/:trackerId/loans', (req, res) => {
  const { trackerId } = req.params;
  const store = readStore();

  if (!store.trackers.some((tracker) => tracker.id === trackerId)) {
    return res.status(404).json({ error: 'Tracker not found.' });
  }

  const loans = store.loans
    .filter((loan) => loan.trackerId === trackerId)
    .map((loan) => ({
      ...mapLoan(loan),
      payments: store.loanPayments.filter((payment) => payment.loanId === loan.id).sort((a, b) => a.date.localeCompare(b.date)),
    }))
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === 'open' ? -1 : 1;
      return a.dueDate.localeCompare(b.dueDate);
    });

  return res.json({ loans });
});

app.post('/api/trackers/:trackerId/loans', (req, res) => {
  const { trackerId } = req.params;
  const { direction, person, amount, currency, dueDate, note } = req.body || {};
  const parsedAmount = Number(amount);
  const parsedDueDate = new Date(`${dueDate}T12:00:00`);
  const validDueDate = /^\d{4}-\d{2}-\d{2}$/.test(String(dueDate || '')) &&
    !Number.isNaN(parsedDueDate.getTime()) &&
    parsedDueDate.toISOString().slice(0, 10) === dueDate;

  if (!['borrowed', 'lent'].includes(direction) || !person || !String(person).trim() ||
      !Number.isFinite(parsedAmount) || parsedAmount <= 0 ||
      !/^[A-Z]{3}$/.test(String(currency || '').toUpperCase()) ||
      !validDueDate) {
    return res.status(400).json({ error: 'Provide a direction, person, positive amount, currency, and valid due date.' });
  }

  const store = readStore();
  if (!store.trackers.some((tracker) => tracker.id === trackerId)) {
    return res.status(404).json({ error: 'Tracker not found.' });
  }

  const loan = {
    id: crypto.randomUUID(),
    trackerId,
    direction,
    person: String(person).trim(),
    amount: parsedAmount,
    paidAmount: 0,
    currency: String(currency).toUpperCase(),
    dueDate,
    note: String(note || '').trim(),
    status: 'open',
    createdAt: new Date().toISOString(),
    settledAt: null,
  };

  store.loans.push(loan);
  recordActivity(store, {
    trackerId,
    sourceId: loan.id,
    kind: 'Loan',
    title: direction === 'borrowed' ? `Borrowed from ${loan.person}` : `Lent to ${loan.person}`,
    detail: loan.note || 'Money lent or borrowed',
    date: loan.createdAt,
    amount: loan.amount,
    currency: loan.currency,
    flow: direction === 'borrowed' ? 'in' : 'out',
  });
  writeStore(store);
  return res.status(201).json({ loan: { ...mapLoan(loan), payments: [] } });
});

app.put('/api/trackers/:trackerId/loans/:loanId', (req, res) => {
  const { trackerId, loanId } = req.params;
  const { direction, person, amount, currency, dueDate, note, status } = req.body || {};
  const parsedAmount = Number(amount);
  const parsedDueDate = new Date(`${dueDate}T12:00:00`);
  const validDueDate = /^\d{4}-\d{2}-\d{2}$/.test(String(dueDate || '')) &&
    !Number.isNaN(parsedDueDate.getTime()) &&
    parsedDueDate.toISOString().slice(0, 10) === dueDate;

  if (!['borrowed', 'lent'].includes(direction) || !person || !String(person).trim() ||
      !Number.isFinite(parsedAmount) || parsedAmount <= 0 ||
      !/^[A-Z]{3}$/.test(String(currency || '').toUpperCase()) ||
      !validDueDate ||
      !['open', 'settled'].includes(status)) {
    return res.status(400).json({ error: 'Provide valid loan details and status.' });
  }

  const store = readStore();
  const loan = store.loans.find((entry) => entry.id === loanId && entry.trackerId === trackerId);
  if (!loan) return res.status(404).json({ error: 'Money record not found.' });
  if (parsedAmount < (Number(loan.paidAmount) || 0)) return res.status(400).json({ error: 'The amount cannot be less than repayments already recorded.' });

  const previousLoan = { ...loan };
  Object.assign(loan, {
    direction,
    person: String(person).trim(),
    amount: parsedAmount,
    currency: String(currency).toUpperCase(),
    dueDate,
    note: String(note || '').trim(),
    status: (Number(loan.paidAmount) || 0) >= parsedAmount ? 'settled' : 'open',
    settledAt: (Number(loan.paidAmount) || 0) >= parsedAmount ? loan.settledAt || new Date().toISOString() : null,
  });
  recordActivityChange(store, trackerId, 'Loan', 'updated', loan,
    `Updated from ${previousLoan.currency} ${Number(previousLoan.amount).toFixed(2)} to ${loan.currency} ${Number(loan.amount).toFixed(2)}`);
  writeStore(store);
  return res.json({ loan: { ...mapLoan(loan), payments: store.loanPayments.filter((payment) => payment.loanId === loan.id) } });
});

app.post('/api/trackers/:trackerId/loans/:loanId/payments', (req, res) => {
  const { trackerId, loanId } = req.params;
  const amount = Number(req.body?.amount);
  const date = new Date(req.body?.date || new Date().toISOString());
  if (!Number.isFinite(amount) || amount <= 0 || Number.isNaN(date.getTime())) return res.status(400).json({ error: 'Enter a positive payment and a valid date.' });
  const store = readStore();
  const loan = store.loans.find((entry) => entry.id === loanId && entry.trackerId === trackerId);
  if (!loan) return res.status(404).json({ error: 'Money record not found.' });
  const remaining = Math.max(0, Number(loan.amount) - (Number(loan.paidAmount) || 0));
  if (amount > remaining) return res.status(400).json({ error: 'Payment cannot exceed the remaining balance.' });
  const payment = {
    id: crypto.randomUUID(),
    trackerId,
    loanId,
    amount,
    date: date.toISOString(),
    note: String(req.body?.note || '').trim().slice(0, 200),
    createdAt: new Date().toISOString(),
  };
  store.loanPayments.push(payment);
  loan.paidAmount = (Number(loan.paidAmount) || 0) + amount;
  loan.status = loan.paidAmount >= Number(loan.amount) ? 'settled' : 'open';
  loan.settledAt = loan.status === 'settled' ? new Date().toISOString() : null;
  recordActivity(store, {
    trackerId,
    sourceId: payment.id,
    kind: 'Repayment',
    title: loan.direction === 'borrowed' ? `Repayment to ${loan.person}` : `Repayment from ${loan.person}`,
    detail: payment.note || (loan.direction === 'borrowed' ? 'Loan repayment' : 'Repayment received'),
    date: payment.date,
    amount: payment.amount,
    currency: loan.currency,
    flow: loan.direction === 'borrowed' ? 'out' : 'in',
  });
  writeStore(store);
  return res.status(201).json({
    payment,
    loan: { ...mapLoan(loan), payments: store.loanPayments.filter((entry) => entry.loanId === loan.id) },
  });
});

app.delete('/api/trackers/:trackerId/loans/:loanId/payments/:paymentId', (req, res) => {
  const store = readStore();
  const loan = store.loans.find((entry) => entry.id === req.params.loanId && entry.trackerId === req.params.trackerId);
  if (!loan) return res.status(404).json({ error: 'Money record not found.' });
  const index = store.loanPayments.findIndex((entry) => entry.id === req.params.paymentId && entry.loanId === loan.id);
  if (index === -1) return res.status(404).json({ error: 'Repayment not found.' });
  const [payment] = store.loanPayments.splice(index, 1);
  recordActivityChange(store, req.params.trackerId, 'Repayment', 'deleted', { ...payment, currency: loan.currency }, 'Repayment removed');
  loan.paidAmount = Math.max(0, (Number(loan.paidAmount) || 0) - Number(payment.amount));
  loan.status = loan.paidAmount >= Number(loan.amount) ? 'settled' : 'open';
  loan.settledAt = loan.status === 'settled' ? loan.settledAt : null;
  writeStore(store);
  return res.json({ loan: { ...mapLoan(loan), payments: store.loanPayments.filter((entry) => entry.loanId === loan.id) } });
});

app.delete('/api/trackers/:trackerId/loans/:loanId', (req, res) => {
  const { trackerId, loanId } = req.params;
  const store = readStore();
  const index = store.loans.findIndex((loan) => loan.id === loanId && loan.trackerId === trackerId);
  if (index === -1) return res.status(404).json({ error: 'Money record not found.' });

  const [loan] = store.loans.splice(index, 1);
  recordActivityChange(store, trackerId, 'Loan', 'deleted', loan, 'Money record deleted');
  store.loanPayments = store.loanPayments.filter((payment) => payment.loanId !== loanId);
  writeStore(store);
  return res.status(204).end();
});

const financeCollections = {
  accounts: {
    key: 'accounts',
    map: (entry) => ({ id: entry.id, trackerId: entry.trackerId, name: entry.name, type: entry.type, currency: entry.currency, openingBalance: Number(entry.openingBalance) || 0, createdAt: entry.createdAt }),
    normalize: (body) => {
      const name = String(body.name || '').trim();
      const type = String(body.type || 'checking');
      const currency = String(body.currency || '').toUpperCase();
      const openingBalance = Number(body.openingBalance || 0);
      if (!name || name.length > 60 || !['cash', 'checking', 'savings', 'credit'].includes(type) || !/^[A-Z]{3}$/.test(currency) ||
        !Number.isFinite(openingBalance) || Math.abs(openingBalance) > 1_000_000_000_000) return null;
      return { name, type, currency, openingBalance };
    },
  },
  incomes: {
    key: 'incomes',
    map: (entry) => ({ ...entry, amount: Number(entry.amount) || 0 }),
    normalize: (body) => {
      const amount = Number(body.amount);
      const date = new Date(body.date);
      const currency = String(body.currency || '').toUpperCase();
      if (!String(body.name || '').trim() || !Number.isFinite(amount) || amount <= 0 || Number.isNaN(date.getTime()) || !/^[A-Z]{3}$/.test(currency)) return null;
      return { name: String(body.name).trim().slice(0, 100), amount, currency, category: String(body.category || 'Income').trim().slice(0, 60), date: date.toISOString(), accountId: String(body.accountId || '') };
    },
  },
  recurring: {
    key: 'recurring',
    map: (entry) => ({ ...entry, kind: entry.kind === 'income' ? 'income' : 'expense', amount: Number(entry.amount) || 0, active: entry.active !== false }),
    normalize: (body) => {
      const amount = Number(body.amount);
      const dueDate = String(body.nextDue || '');
      const date = new Date(`${dueDate}T12:00:00`);
      const currency = String(body.currency || '').toUpperCase();
      if (!String(body.name || '').trim() || !Number.isFinite(amount) || amount <= 0 ||
        !['weekly', 'monthly', 'yearly'].includes(body.frequency) || !/^[A-Z]{3}$/.test(currency) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(dueDate) || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== dueDate) return null;
      return { name: String(body.name).trim().slice(0, 100), amount, currency, category: String(body.category || (body.kind === 'income' ? 'Income' : 'Bills & utilities')).trim().slice(0, 60), frequency: body.frequency, nextDue: dueDate, accountId: String(body.accountId || ''), kind: body.kind === 'income' ? 'income' : 'expense', active: body.active !== false };
    },
  },
  goals: {
    key: 'goals',
    map: (entry) => ({ ...entry, targetAmount: Number(entry.targetAmount) || 0, currentAmount: Number(entry.currentAmount) || 0, contributions: Array.isArray(entry.contributions) ? entry.contributions : [] }),
    normalize: (body) => {
      const targetAmount = Number(body.targetAmount);
      const currentAmount = Number(body.currentAmount || 0);
      const currency = String(body.currency || '').toUpperCase();
      if (!String(body.name || '').trim() || !Number.isFinite(targetAmount) || targetAmount <= 0 || !Number.isFinite(currentAmount) || currentAmount < 0 || !/^[A-Z]{3}$/.test(currency)) return null;
      const targetDate = body.targetDate ? String(body.targetDate) : '';
      if (targetDate && (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate) || Number.isNaN(new Date(`${targetDate}T12:00:00`).getTime()))) return null;
      const contributions = Array.isArray(body.contributions) ? body.contributions : [];
      if (contributions.length > 10000 || contributions.some((entry) =>
        !entry || !String(entry.id || '').trim() || !Number.isFinite(Number(entry.amount)) || Number(entry.amount) <= 0 || Number.isNaN(new Date(entry.date).getTime()))) return null;
      return { name: String(body.name).trim().slice(0, 100), targetAmount, currentAmount, currency, targetDate, contributions };
    },
  },
  categories: {
    key: 'categories',
    map: (entry) => ({ ...entry }),
    normalize: (body) => {
      const name = String(body.name || '').trim();
      if (!name || name.length > 60) return null;
      return { name, kind: body.kind === 'income' ? 'income' : 'expense' };
    },
  },
};

for (const [resource, config] of Object.entries(financeCollections)) {
  const singular = { accounts: 'account', incomes: 'income', recurring: 'recurring', goals: 'goal', categories: 'category' }[resource];
  app.get(`/api/trackers/:trackerId/${resource}`, (req, res) => {
    const store = readStore();
    if (!store.trackers.some((tracker) => tracker.id === req.params.trackerId)) return res.status(404).json({ error: 'Tracker not found.' });
    const entries = store[config.key].filter((entry) => entry.trackerId === req.params.trackerId).map(config.map);
    return res.json({ [resource]: entries });
  });

  app.post(`/api/trackers/:trackerId/${resource}`, (req, res) => {
    const store = readStore();
    const { trackerId } = req.params;
    if (!store.trackers.some((tracker) => tracker.id === trackerId)) return res.status(404).json({ error: 'Tracker not found.' });
    const normalized = config.normalize(req.body || {});
    if (!normalized) return res.status(400).json({ error: `Provide valid ${resource} details.` });
    if (normalized.accountId && !store.accounts.some((account) => account.id === normalized.accountId && account.trackerId === trackerId)) return res.status(400).json({ error: 'Select a valid account.' });
    if (resource === 'categories' && store.categories.some((entry) => entry.trackerId === trackerId && entry.kind === normalized.kind && entry.name.toLowerCase() === normalized.name.toLowerCase())) {
      return res.status(409).json({ error: 'That category already exists.' });
    }
    const entry = { ...normalized, id: crypto.randomUUID(), trackerId, createdAt: new Date().toISOString() };
    store[config.key].push(entry);
    if (resource === 'incomes') {
      recordActivity(store, {
        trackerId,
        sourceId: entry.id,
        kind: 'Income',
        title: entry.name,
        detail: entry.category,
        date: entry.date,
        amount: entry.amount,
        currency: entry.currency,
        flow: 'in',
      });
    } else if (resource === 'accounts' && Number(entry.openingBalance) !== 0) {
      recordActivity(store, {
        trackerId,
        sourceId: entry.id,
        kind: 'Opening balance',
        title: `${entry.name} opening balance`,
        detail: 'Starting account balance',
        date: entry.createdAt,
        amount: Math.abs(Number(entry.openingBalance)),
        currency: entry.currency,
        flow: Number(entry.openingBalance) > 0 ? 'in' : 'out',
      });
    } else if (resource === 'goals') {
      recordActivity(store, {
        trackerId,
        sourceId: entry.id,
        kind: 'Savings goal',
        title: entry.name,
        detail: 'Savings goal created',
        amount: 0,
        currency: entry.currency,
        flow: 'neutral',
      });
    } else if (resource === 'recurring') {
      recordActivity(store, {
        trackerId,
        sourceId: entry.id,
        kind: 'Recurring schedule',
        title: entry.name,
        detail: `${entry.kind} · ${entry.frequency} schedule created`,
        amount: 0,
        currency: entry.currency,
        flow: 'neutral',
      });
    }
    writeStore(store);
    return res.status(201).json({ [singular]: config.map(entry) });
  });

  app.put(`/api/trackers/:trackerId/${resource}/:entryId`, (req, res) => {
    const store = readStore();
    const { trackerId, entryId } = req.params;
    const entry = store[config.key].find((item) => item.id === entryId && item.trackerId === trackerId);
    if (!entry) return res.status(404).json({ error: 'Record not found.' });
    const normalized = config.normalize({ ...(config.map(entry)), ...(req.body || {}) });
    if (!normalized) return res.status(400).json({ error: `Provide valid ${resource} details.` });
    if (normalized.accountId && !store.accounts.some((account) => account.id === normalized.accountId && account.trackerId === trackerId)) return res.status(400).json({ error: 'Select a valid account.' });
    if (resource === 'categories' && store.categories.some((item) => item.id !== entryId && item.trackerId === trackerId && item.kind === normalized.kind && item.name.toLowerCase() === normalized.name.toLowerCase())) {
      return res.status(409).json({ error: 'That category already exists.' });
    }
    const previous = { ...entry };
    Object.assign(entry, normalized);
    if (resource === 'incomes') {
      recordActivityChange(store, trackerId, 'Income', 'updated', entry,
        `Updated from ${previous.currency} ${Number(previous.amount).toFixed(2)} to ${entry.currency} ${Number(entry.amount).toFixed(2)}`);
    } else if (resource === 'accounts' && Number(previous.openingBalance) !== Number(entry.openingBalance)) {
      recordActivity(store, {
        trackerId,
        sourceId: entry.id,
        kind: 'Opening balance',
        action: 'updated',
        title: `${entry.name} opening balance updated`,
        detail: `Changed from ${previous.currency} ${Number(previous.openingBalance).toFixed(2)} to ${entry.currency} ${Number(entry.openingBalance).toFixed(2)}`,
        amount: 0,
        currency: entry.currency,
      });
    } else if (resource === 'goals' && (previous.name !== entry.name || Number(previous.targetAmount) !== Number(entry.targetAmount) || previous.targetDate !== entry.targetDate)) {
      recordActivity(store, {
        trackerId,
        sourceId: entry.id,
        kind: 'Savings goal',
        action: 'updated',
        title: entry.name,
        detail: `Goal updated · target ${entry.currency} ${Number(entry.targetAmount).toFixed(2)}`,
        amount: 0,
        currency: entry.currency,
      });
    } else if (resource === 'recurring' && (
      previous.name !== entry.name || previous.amount !== entry.amount || previous.currency !== entry.currency ||
      previous.category !== entry.category || previous.kind !== entry.kind || previous.nextDue !== entry.nextDue ||
      previous.frequency !== entry.frequency || previous.accountId !== entry.accountId || previous.active !== entry.active
    )) {
      recordActivity(store, {
        trackerId,
        sourceId: entry.id,
        kind: 'Recurring schedule',
        action: 'updated',
        title: entry.name,
        detail: `${entry.active ? 'Active' : 'Paused'} · ${entry.kind} · ${entry.frequency} · next due ${entry.nextDue}`,
        amount: 0,
        currency: entry.currency,
      });
    }
    writeStore(store);
    return res.json({ [singular]: config.map(entry) });
  });

  app.delete(`/api/trackers/:trackerId/${resource}/:entryId`, (req, res) => {
    const store = readStore();
    const { trackerId, entryId } = req.params;
    const index = store[config.key].findIndex((item) => item.id === entryId && item.trackerId === trackerId);
    if (index === -1) return res.status(404).json({ error: 'Record not found.' });
    if (resource === 'accounts' && [...store.expenses, ...store.incomes, ...store.recurring].some((item) => item.trackerId === trackerId && item.accountId === entryId)) {
      return res.status(409).json({ error: 'This account is assigned to records. Reassign them before deleting the account.' });
    }
    const [entry] = store[config.key].splice(index, 1);
    let deletionActivityId = '';
    if (resource === 'incomes') deletionActivityId = recordActivityChange(store, trackerId, 'Income', 'deleted', entry, 'Income record deleted').id;
    if (resource === 'accounts' && Number(entry.openingBalance) !== 0) {
      recordActivityChange(store, trackerId, 'Opening balance', 'deleted', {
        ...entry,
        amount: Math.abs(Number(entry.openingBalance)),
      }, 'Account opening balance removed');
    }
    if (resource === 'goals') {
      recordActivity(store, {
        trackerId,
        sourceId: entry.id,
        kind: 'Savings goal',
        action: 'deleted',
        title: entry.name,
        detail: 'Savings goal deleted',
        amount: 0,
        currency: entry.currency,
      });
    }
    if (resource === 'recurring') deletionActivityId = recordActivityChange(store, trackerId, 'Recurring schedule', 'deleted', entry, 'Recurring schedule deleted').id;
    writeStore(store);
    if (resource === 'incomes' || resource === 'recurring') {
      return res.json({ [singular]: config.map(entry), deletionActivityId });
    }
    return res.status(204).end();
  });

  if (resource === 'incomes' || resource === 'recurring') {
    app.post(`/api/trackers/:trackerId/${resource}/:entryId/restore`, (req, res) => {
      const store = readStore();
      const { trackerId, entryId } = req.params;
      if (!store.trackers.some((tracker) => tracker.id === trackerId)) return res.status(404).json({ error: 'Tracker not found.' });
      if (store[config.key].some((entry) => entry.id === entryId && entry.trackerId === trackerId)) {
        return res.status(409).json({ error: `This ${resource.slice(0, -1)} already exists and cannot be restored twice.` });
      }
      const body = req.body || {};
      const normalized = config.normalize(body.record || {});
      if (!normalized) return res.status(400).json({ error: `The deleted ${resource.slice(0, -1)} snapshot is invalid.` });
      if (normalized.accountId && !store.accounts.some((account) => account.id === normalized.accountId && account.trackerId === trackerId)) {
        return res.status(400).json({ error: 'The original account no longer exists in this tracker.' });
      }
      const historyKind = resource === 'incomes' ? 'Income' : 'Recurring schedule';
      if (!removeDeletionActivity(store, trackerId, entryId, body.deletionActivityId, historyKind)) {
        return res.status(409).json({ error: 'The deletion can no longer be undone.' });
      }
      const entry = {
        ...normalized,
        id: entryId,
        trackerId,
        createdAt: String(body.record?.createdAt || new Date().toISOString()),
      };
      store[config.key].push(entry);
      writeStore(store);
      return res.status(201).json({ [singular]: config.map(entry) });
    });
  }
}

app.post('/api/trackers/:trackerId/goals/:goalId/contributions', (req, res) => {
  const amount = Number(req.body?.amount);
  if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: 'Contribution must be greater than zero.' });
  const store = readStore();
  const goal = store.goals.find((entry) => entry.id === req.params.goalId && entry.trackerId === req.params.trackerId);
  if (!goal) return res.status(404).json({ error: 'Goal not found.' });
  const appliedAmount = Math.min(amount, Math.max(0, Number(goal.targetAmount) - Number(goal.currentAmount || 0)));
  if (appliedAmount <= 0) return res.status(400).json({ error: 'This goal has already reached its target.' });
  const contribution = { id: crypto.randomUUID(), amount: appliedAmount, date: new Date().toISOString() };
  goal.currentAmount = Number(goal.currentAmount || 0) + appliedAmount;
  if (!Array.isArray(goal.contributions)) goal.contributions = [];
  goal.contributions.push(contribution);
  recordActivity(store, {
    trackerId: goal.trackerId,
    sourceId: contribution.id,
    kind: 'Goal contribution',
    title: goal.name,
    detail: 'Savings goal contribution',
    date: contribution.date,
    amount: contribution.amount,
    currency: goal.currency,
    flow: 'transfer',
  });
  writeStore(store);
  return res.json({ goal: financeCollections.goals.map(goal), contribution });
});

function nextRecurringDate(dateString, frequency) {
  const date = new Date(`${dateString}T12:00:00`);
  if (frequency === 'weekly') date.setDate(date.getDate() + 7);
  else if (frequency === 'yearly') date.setFullYear(date.getFullYear() + 1);
  else {
    const day = date.getDate();
    date.setDate(1);
    date.setMonth(date.getMonth() + 1);
    const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    date.setDate(Math.min(day, lastDay));
  }
  return date.toISOString().slice(0, 10);
}

app.post('/api/trackers/:trackerId/recurring/:entryId/pay', (req, res) => {
  const store = readStore();
  const recurring = store.recurring.find((entry) => entry.id === req.params.entryId && entry.trackerId === req.params.trackerId && entry.active !== false);
  if (!recurring) return res.status(404).json({ error: 'Active recurring payment not found.' });
  const entry = {
    id: crypto.randomUUID(),
    trackerId: recurring.trackerId,
    name: recurring.name,
    amount: Number(recurring.amount),
    category: recurring.category,
    currency: recurring.currency,
    date: new Date().toISOString(),
    icon: 'wallet',
    tone: 'sage',
    accountId: recurring.accountId || '',
    ...(recurring.kind === 'income' ? {} : { tags: ['recurring'], receipt: '' }),
  };
  recurring.nextDue = nextRecurringDate(recurring.nextDue, recurring.frequency);
  const collection = recurring.kind === 'income' ? 'incomes' : 'expenses';
  store[collection].push(entry);
  recordActivity(store, {
    trackerId: recurring.trackerId,
    sourceId: entry.id,
    kind: recurring.kind === 'income' ? 'Income' : 'Expense',
    title: entry.name,
    detail: `${entry.category} · recurring`,
    date: entry.date,
    amount: entry.amount,
    currency: entry.currency,
    flow: recurring.kind === 'income' ? 'in' : 'out',
  });
  writeStore(store);
  return res.status(201).json({ [recurring.kind]: recurring.kind === 'income' ? financeCollections.incomes.map(entry) : mapExpense(entry), recurring: financeCollections.recurring.map(recurring) });
});

app.get('/api/trackers/:trackerId/transfers', (req, res) => {
  const store = readStore();
  return res.json({ transfers: store.transfers.filter((entry) => entry.trackerId === req.params.trackerId) });
});

app.post('/api/trackers/:trackerId/transfers', (req, res) => {
  const { fromAccountId, toAccountId } = req.body || {};
  const amount = Number(req.body?.amount);
  const store = readStore();
  const fromAccount = store.accounts.find((entry) => entry.id === fromAccountId && entry.trackerId === req.params.trackerId);
  const toAccount = store.accounts.find((entry) => entry.id === toAccountId && entry.trackerId === req.params.trackerId);
  if (!fromAccount || !toAccount || fromAccount.id === toAccount.id || fromAccount.currency !== toAccount.currency ||
      !Number.isFinite(amount) || amount <= 0 || amount > 1_000_000_000_000) {
    return res.status(400).json({ error: 'Choose two different accounts in the same currency and a positive amount.' });
  }
  const transfer = {
    id: crypto.randomUUID(),
    trackerId: req.params.trackerId,
    fromAccountId,
    toAccountId,
    amount,
    currency: fromAccount.currency,
    date: new Date(req.body?.date || Date.now()).toISOString(),
    note: String(req.body?.note || '').trim().slice(0, 200),
    createdAt: new Date().toISOString(),
  };
  store.transfers.push(transfer);
  const fromName = fromAccount.name;
  const toName = toAccount.name;
  recordActivity(store, {
    trackerId: transfer.trackerId,
    sourceId: transfer.id,
    kind: 'Transfer',
    title: 'Account transfer',
    detail: `${fromName} to ${toName}${transfer.note ? ` · ${transfer.note}` : ''}`,
    date: transfer.date,
    amount: transfer.amount,
    currency: transfer.currency,
    flow: 'transfer',
  });
  writeStore(store);
  return res.status(201).json({ transfer });
});

function calculateAccountBalance(store, trackerId, accountId) {
  const account = store.accounts.find((entry) => entry.id === accountId && entry.trackerId === trackerId);
  if (!account) return null;
  const incomes = store.incomes.filter((entry) => entry.accountId === accountId).reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
  const expenses = store.expenses.filter((entry) => entry.accountId === accountId).reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
  const transfersIn = store.transfers.filter((entry) => entry.toAccountId === accountId).reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
  const transfersOut = store.transfers.filter((entry) => entry.fromAccountId === accountId).reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
  const adjustments = store.reconciliations.filter((entry) => entry.accountId === accountId).reduce((sum, entry) => sum + Number(entry.adjustment || 0), 0);
  return Number(account.openingBalance || 0) + incomes - expenses + transfersIn - transfersOut + adjustments;
}

app.post('/api/trackers/:trackerId/accounts/:accountId/reconcile', (req, res) => {
  const actualBalance = Number(req.body?.actualBalance);
  const store = readStore();
  const currentBalance = calculateAccountBalance(store, req.params.trackerId, req.params.accountId);
  if (currentBalance === null) return res.status(404).json({ error: 'Account not found.' });
  if (!Number.isFinite(actualBalance) || Math.abs(actualBalance) > 1_000_000_000_000) return res.status(400).json({ error: 'Enter a valid account statement balance.' });
  const reconciliation = {
    id: crypto.randomUUID(),
    trackerId: req.params.trackerId,
    accountId: req.params.accountId,
    expectedBalance: currentBalance,
    actualBalance,
    adjustment: actualBalance - currentBalance,
    date: new Date(req.body?.date || Date.now()).toISOString(),
    note: String(req.body?.note || '').trim().slice(0, 200),
    createdAt: new Date().toISOString(),
  };
  store.reconciliations.push(reconciliation);
  if (reconciliation.adjustment !== 0) {
    const account = store.accounts.find((entry) => entry.id === reconciliation.accountId);
    recordActivity(store, {
      trackerId: reconciliation.trackerId,
      sourceId: reconciliation.id,
      kind: 'Reconciliation',
      title: `${account?.name || 'Account'} balance adjustment`,
      detail: reconciliation.note || 'Account reconciliation',
      date: reconciliation.date,
      amount: Math.abs(reconciliation.adjustment),
      currency: account?.currency || 'USD',
      flow: reconciliation.adjustment > 0 ? 'in' : 'out',
    });
  }
  writeStore(store);
  return res.status(201).json({ reconciliation, currentBalance: actualBalance });
});

app.get('/api/trackers/:trackerId/backup', (req, res) => {
  const store = readStore();
  const { trackerId } = req.params;
  const tracker = store.trackers.find((entry) => entry.id === trackerId);
  if (!tracker) return res.status(404).json({ error: 'Tracker not found.' });
  const collections = ['expenses', 'loans', 'incomes', 'recurring', 'goals', 'categories', 'accounts', 'transfers', 'reconciliations', 'loanPayments'];
  const records = Object.fromEntries(collections.map((key) => [key, store[key].filter((entry) => entry.trackerId === trackerId)]));
  const history = store.activities.filter((entry) => entry.trackerId === trackerId);
  return res.json({ format: 'hearthy-backup', version: 1, exportedAt: new Date().toISOString(), tracker, ...records, history });
});

app.post('/api/trackers/:trackerId/backup', (req, res) => {
  const store = readStore();
  const { trackerId } = req.params;
  const tracker = store.trackers.find((entry) => entry.id === trackerId);
  const backup = req.body || {};
  if (!tracker) return res.status(404).json({ error: 'Tracker not found.' });
  if (backup.format !== 'hearthy-backup' || backup.version !== 1) return res.status(400).json({ error: 'This is not a supported Hearthy backup file.' });
  const collections = ['expenses', 'loans', 'incomes', 'recurring', 'goals', 'categories', 'accounts', 'transfers', 'reconciliations', 'loanPayments'];
  if (collections.some((key) => !Array.isArray(backup[key]) || backup[key].length > 10000)) return res.status(400).json({ error: 'Backup data is incomplete or exceeds supported limits.' });
  if (backup.history !== undefined && (!Array.isArray(backup.history) || backup.history.length > 50000)) return res.status(400).json({ error: 'Backup history is invalid or exceeds the supported limit.' });
  const historyKinds = ['Expense', 'Income', 'Transfer', 'Loan', 'Repayment', 'Goal contribution', 'Savings goal', 'Recurring schedule', 'Opening balance', 'Reconciliation', 'Budget'];
  const historyActions = ['recorded', 'updated', 'deleted'];
  const historyFlows = ['in', 'out', 'transfer', 'neutral'];
  const restoredHistory = (backup.history || []).map((entry) => {
    const date = new Date(entry?.date);
    const recordedAt = new Date(entry?.recordedAt || entry?.date);
    if (!entry || !historyKinds.includes(entry.kind) || !historyActions.includes(entry.action) ||
      !String(entry.title || '').trim() || Number.isNaN(date.getTime()) || Number.isNaN(recordedAt.getTime()) ||
      !Number.isFinite(Number(entry.amount)) || Number(entry.amount) < 0 ||
      !/^[A-Z]{3}$/.test(String(entry.currency || '').toUpperCase()) || !historyFlows.includes(entry.flow)) return null;
    return {
      id: crypto.randomUUID(),
      trackerId,
      sourceId: String(entry.sourceId || '').slice(0, 100),
      kind: entry.kind,
      action: entry.action,
      title: String(entry.title).slice(0, 120),
      detail: String(entry.detail || '').slice(0, 300),
      date: date.toISOString(),
      recordedAt: recordedAt.toISOString(),
      amount: Number(entry.amount),
      currency: String(entry.currency).toUpperCase(),
      flow: entry.flow,
    };
  });
  if (restoredHistory.some((entry) => !entry)) return res.status(400).json({ error: 'Backup contains an invalid history entry.' });
  const accountIds = new Map();
  const restored = Object.fromEntries(collections.map((key) => [key, []]));
  const validAmount = (amount) => Number.isFinite(Number(amount)) && Number(amount) > 0;
  const validCurrency = (currency) => /^[A-Z]{3}$/.test(String(currency || '').toUpperCase());
  const validDate = (date) => !Number.isNaN(new Date(date).getTime());
  for (const entry of backup.accounts) {
    const normalized = financeCollections.accounts.normalize(entry || {});
    if (!normalized || !entry.id || accountIds.has(entry.id)) return res.status(400).json({ error: 'Backup contains an invalid or duplicate account.' });
    const id = crypto.randomUUID();
    accountIds.set(entry.id, id);
    restored.accounts.push({ ...normalized, id, trackerId, createdAt: new Date().toISOString() });
  }
  for (const entry of backup.categories) {
    const normalized = financeCollections.categories.normalize(entry || {});
    if (!normalized) return res.status(400).json({ error: 'Backup contains an invalid category.' });
    restored.categories.push({ ...normalized, id: crypto.randomUUID(), trackerId, createdAt: new Date().toISOString() });
  }
  for (const entry of backup.expenses) {
    const amount = Number(entry?.amount);
    if (!entry || !String(entry.name || '').trim() || !String(entry.category || '').trim() || !validAmount(amount) || !validCurrency(entry.currency) || !validDate(entry.date) ||
      (entry.accountId && !accountIds.has(entry.accountId)) || (entry.receipt && (typeof entry.receipt !== 'string' || entry.receipt.length > 2_500_000 || !/^data:image\/(png|jpeg|webp);base64,/.test(entry.receipt)))) {
      return res.status(400).json({ error: 'Backup contains an invalid expense.' });
    }
    restored.expenses.push({
      id: crypto.randomUUID(), trackerId, name: String(entry.name).trim().slice(0, 100), amount,
      category: String(entry.category).slice(0, 60), currency: String(entry.currency).toUpperCase(), date: new Date(entry.date).toISOString(),
      icon: String(entry.icon || 'wallet').slice(0, 40), tone: String(entry.tone || 'sage').slice(0, 40),
      accountId: entry.accountId ? accountIds.get(entry.accountId) : '',
      tags: Array.isArray(entry.tags) ? entry.tags.map((tag) => String(tag).trim()).filter(Boolean).slice(0, 20) : [],
      receipt: entry.receipt || '',
    });
  }
  for (const entry of backup.loans) {
    const dueDate = String(entry?.dueDate || '');
    const due = new Date(`${dueDate}T12:00:00`);
    if (!entry || !['borrowed', 'lent'].includes(entry.direction) || !String(entry.person || '').trim() || !validAmount(Number(entry.amount)) ||
      !validCurrency(entry.currency) || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate) || Number.isNaN(due.getTime()) ||
      due.toISOString().slice(0, 10) !== dueDate || !['open', 'settled'].includes(entry.status)) return res.status(400).json({ error: 'Backup contains an invalid money record.' });
    restored.loans.push({ id: crypto.randomUUID(), trackerId, direction: entry.direction, person: String(entry.person).trim().slice(0, 80), amount: Number(entry.amount), currency: String(entry.currency).toUpperCase(), dueDate, note: String(entry.note || '').slice(0, 240), status: entry.status, createdAt: new Date().toISOString(), settledAt: entry.status === 'settled' ? entry.settledAt || new Date().toISOString() : null });
  }
  for (const resource of ['incomes', 'recurring']) {
    const config = financeCollections[resource];
    for (const entry of backup[resource]) {
      const normalized = config.normalize(entry || {});
      if (!normalized || (normalized.accountId && !accountIds.has(normalized.accountId))) return res.status(400).json({ error: `Backup contains an invalid ${resource} record.` });
      if (normalized.accountId) normalized.accountId = accountIds.get(normalized.accountId);
      restored[resource].push({ ...normalized, id: crypto.randomUUID(), trackerId, createdAt: new Date().toISOString() });
    }
  }
  for (const entry of backup.goals) {
    const normalized = financeCollections.goals.normalize(entry || {});
    if (!normalized) return res.status(400).json({ error: 'Backup contains an invalid savings goal.' });
    normalized.contributions = normalized.contributions.map((contribution) => ({
      id: crypto.randomUUID(),
      amount: Number(contribution.amount),
      date: new Date(contribution.date).toISOString(),
    }));
    restored.goals.push({ ...normalized, id: crypto.randomUUID(), trackerId, createdAt: new Date().toISOString() });
  }
  for (const entry of backup.transfers) {
    const fromAccountId = accountIds.get(entry?.fromAccountId);
    const toAccountId = accountIds.get(entry?.toAccountId);
    const from = restored.accounts.find((account) => account.id === fromAccountId);
    const to = restored.accounts.find((account) => account.id === toAccountId);
    if (!from || !to || from.currency !== to.currency || !validAmount(Number(entry.amount)) || !validDate(entry.date)) return res.status(400).json({ error: 'Backup contains an invalid account transfer.' });
    restored.transfers.push({ id: crypto.randomUUID(), trackerId, fromAccountId, toAccountId, amount: Number(entry.amount), currency: from.currency, date: new Date(entry.date).toISOString(), note: String(entry.note || '').slice(0, 200), createdAt: new Date().toISOString() });
  }
  for (const entry of backup.reconciliations) {
    const accountId = accountIds.get(entry?.accountId);
    if (!accountId || !Number.isFinite(Number(entry.adjustment)) || !validDate(entry.date)) return res.status(400).json({ error: 'Backup contains an invalid account reconciliation.' });
    restored.reconciliations.push({ id: crypto.randomUUID(), trackerId, accountId, expectedBalance: Number(entry.expectedBalance) || 0, actualBalance: Number(entry.actualBalance) || 0, adjustment: Number(entry.adjustment), date: new Date(entry.date).toISOString(), note: String(entry.note || '').slice(0, 200), createdAt: new Date().toISOString() });
  }
  for (const entry of backup.loanPayments) {
    if (!entry?.loanId || !validAmount(Number(entry.amount)) || !validDate(entry.date)) return res.status(400).json({ error: 'Backup contains an invalid loan repayment.' });
    restored.loanPayments.push({ id: crypto.randomUUID(), trackerId, loanId: entry.loanId, amount: Number(entry.amount), date: new Date(entry.date).toISOString(), note: String(entry.note || '').slice(0, 200), createdAt: new Date().toISOString() });
  }
  for (const key of collections) {
    store[key] = store[key].filter((entry) => entry.trackerId !== trackerId);
    store[key].push(...restored[key]);
  }
  if (backup.tracker && typeof backup.tracker === 'object') {
    tracker.name = String(backup.tracker.name || tracker.name).slice(0, 100);
    tracker.currency = /^[A-Z]{3}$/.test(String(backup.tracker.currency || '').toUpperCase()) ? String(backup.tracker.currency).toUpperCase() : tracker.currency;
    tracker.context = String(backup.tracker.context || tracker.context).slice(0, 60);
    tracker.destination = String(backup.tracker.destination || '').slice(0, 100);
    tracker.budget = Math.max(0, Number(backup.tracker.budget) || 0);
  }
  writeStore(store);
  return res.json({ ok: true });
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on the server.' });
});

app.listen(port, '127.0.0.1', () => {
  console.log(`Hearthy API running on http://localhost:${port}`);
});
