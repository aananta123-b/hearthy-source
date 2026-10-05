import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const app = express();
const port = Number(process.env.PORT || 3001);
const dataDir = path.resolve(process.cwd(), 'server/data');
const dataFile = path.join(dataDir, 'store.json');

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
    };
  } catch {
    return { users: [], trackers: [], expenses: [] };
  }
}

function writeStore(store) {
  ensureStore();
  fs.writeFileSync(dataFile, JSON.stringify(store, null, 2));
}

function sanitizeUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    createdAt: user.createdAt,
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

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, name: 'hearthy-api' });
});

app.post('/api/auth/signup', (req, res) => {
  const { name, email, password } = req.body || {};

  if (!name || !name.trim() || !email || !email.trim() || !password || !password.trim()) {
    return res.status(400).json({ error: 'Name, email, and password are required.' });
  }

  const store = readStore();
  const normalizedEmail = String(email).trim().toLowerCase();
  if (store.users.some((user) => user.email.toLowerCase() === normalizedEmail)) {
    return res.status(409).json({ error: 'An account with this email already exists.' });
  }

  const user = {
    id: crypto.randomUUID(),
    name: name.trim(),
    email: normalizedEmail,
    password: String(password),
    createdAt: new Date().toISOString(),
  };

  store.users.push(user);
  writeStore(store);

  return res.status(201).json({ user: sanitizeUser(user) });
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  const store = readStore();
  const user = store.users.find(
    (entry) => entry.email.toLowerCase() === String(email).trim().toLowerCase() && entry.password === String(password),
  );

  if (!user) {
    return res.status(401).json({ error: 'Incorrect email or password.' });
  }

  return res.json({ user: sanitizeUser(user) });
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
  const { userId, name, currency, context, destination } = req.body || {};

  if (!userId || !name || !currency || !context) {
    return res.status(400).json({ error: 'Tracker details are incomplete.' });
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
    budget: 0,
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
  const { budget } = req.body || {};
  const parsedBudget = Number(budget);

  if (!Number.isFinite(parsedBudget) || parsedBudget < 0) {
    return res.status(400).json({ error: 'A valid budget is required.' });
  }

  const store = readStore();
  const tracker = store.trackers.find((entry) => entry.id === trackerId);

  if (!tracker) {
    return res.status(404).json({ error: 'Tracker not found.' });
  }

  tracker.budget = parsedBudget;
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
  const { name, amount, category, currency, date, icon, tone } = req.body || {};
  const parsedAmount = Number(amount);
  const parsedDate = date ? new Date(date) : new Date();

  if (!name || !String(name).trim() || !category || !currency || !Number.isFinite(parsedAmount) || parsedAmount <= 0 || Number.isNaN(parsedDate.getTime())) {
    return res.status(400).json({ error: 'Expense details are incomplete.' });
  }

  const store = readStore();
  const trackerExists = store.trackers.some((entry) => entry.id === trackerId);

  if (!trackerExists) {
    return res.status(404).json({ error: 'Tracker not found.' });
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
  };

  store.expenses.push(expense);
  writeStore(store);

  return res.status(201).json({ expense: mapExpense(expense) });
});

app.put('/api/trackers/:trackerId/expenses/:expenseId', (req, res) => {
  const { trackerId, expenseId } = req.params;
  const { name, amount, category, currency, date, icon, tone } = req.body || {};
  const parsedAmount = Number(amount);
  const parsedDate = new Date(date);

  if (!name || !String(name).trim() || !category || !currency || !Number.isFinite(parsedAmount) || parsedAmount <= 0 || Number.isNaN(parsedDate.getTime())) {
    return res.status(400).json({ error: 'Provide a valid name, positive amount, category, currency, and date.' });
  }

  const store = readStore();
  const expense = store.expenses.find((entry) => entry.id === expenseId && entry.trackerId === trackerId);

  if (!expense) {
    return res.status(404).json({ error: 'Expense not found.' });
  }

  Object.assign(expense, {
    name: String(name).trim(),
    amount: parsedAmount,
    category: String(category),
    currency: String(currency).toUpperCase(),
    date: parsedDate.toISOString(),
    icon: icon || 'wallet',
    tone: tone || 'sage',
  });
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

  store.expenses.splice(expenseIndex, 1);
  writeStore(store);

  return res.status(204).end();
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on the server.' });
});

app.listen(port, () => {
  console.log(`Hearthy API running on http://localhost:${port}`);
});
