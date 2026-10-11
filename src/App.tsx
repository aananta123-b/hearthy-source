import { useEffect, useRef, useState, type ReactNode } from "react";

type IconName =
  | "home"
  | "history"
  | "wallet"
  | "chart"
  | "target"
  | "settings"
  | "search"
  | "bell"
  | "plus"
  | "arrowUp"
  | "arrowDown"
  | "cart"
  | "coffee"
  | "car"
  | "homeSmall"
  | "chevron"
  | "close";

type ExpenseTransaction = {
  id?: string;
  icon: IconName;
  name: string;
  category: string;
  date: string;
  dateISO?: string;
  amount: number;
  currency: string;
  tone: string;
  accountId?: string;
  tags?: string[];
  receipt?: string;
};

type ImportExpense = {
  name: string;
  amount: number;
  category: string;
  currency: string;
  date: string;
  icon: IconName;
  tone: string;
  accountId: string;
  tags: string[];
};

type CsvPreviewRow = {
  lineNumber: number;
  expense?: ImportExpense;
  error?: string;
  duplicate: boolean;
  selected: boolean;
};

type MoneyRecord = {
  id: string;
  trackerId: string;
  direction: "borrowed" | "lent";
  person: string;
  amount: number;
  currency: string;
  dueDate: string;
  note: string;
  status: "open" | "settled";
  createdAt: string;
  settledAt: string | null;
  paidAmount?: number;
  remainingAmount?: number;
  payments?: Array<{ id: string; amount: number; date: string; note: string }>;
};

type FinanceAccount = { id: string; name: string; type: string; currency: string; openingBalance: number; createdAt?: string };
type IncomeRecord = { id: string; name: string; amount: number; currency: string; category: string; date: string; accountId: string };
type RecurringRecord = { id: string; name: string; amount: number; currency: string; category: string; kind: "income" | "expense"; frequency: "weekly" | "monthly" | "yearly"; nextDue: string; accountId: string; active: boolean };
type GoalContribution = { id: string; amount: number; date: string };
type SavingsGoal = { id: string; name: string; targetAmount: number; currentAmount: number; currency: string; targetDate: string; contributions?: GoalContribution[] };
type CustomCategory = { id: string; name: string; kind: "expense" | "income" };
type AccountTransfer = { id: string; fromAccountId: string; toAccountId: string; amount: number; currency: string; date: string; note: string };
type HistoryActivity = {
  id: string;
  sourceId: string;
  kind: "Expense" | "Income" | "Transfer" | "Loan" | "Repayment" | "Goal contribution" | "Savings goal" | "Recurring schedule" | "Opening balance" | "Reconciliation" | "Budget";
  action: "recorded" | "updated" | "deleted";
  title: string;
  detail: string;
  date: string;
  recordedAt: string;
  amount: number;
  currency: string;
  flow: "in" | "out" | "transfer" | "neutral";
};

type TrackerConfig = {
  id?: string;
  userId?: string;
  createdAt?: string;
  name: string;
  currency: string;
  context: string;
  destination: string;
  budget?: number;
};

type NotificationPreferences = {
  emailReminders: boolean;
  browserReminders: boolean;
  weeklyDigest: boolean;
};

type User = {
  id: string;
  name: string;
  username?: string;
  email: string;
  avatar?: string;
  bio?: string;
  createdAt?: string;
  membershipPlanMonths?: number;
  membershipExpiresAt?: string;
  notificationPreferences?: NotificationPreferences;
};

const fallbackCurrencyCodes = "AED AFN ALL AMD AOA ARS AUD AWG AZN BAM BBD BDT BGN BHD BIF BMD BND BOB BOV BRL BSD BTN BWP BYN BZD CAD CDF CHE CHF CHW CLF CLP CNY COP COU CRC CUC CUP CVE CZK DJF DKK DOP DZD EGP ERN ETB EUR FJD FKP GBP GEL GHS GIP GMD GNF GTQ GYD HKD HNL HRK HTG HUF IDR ILS INR IQD IRR ISK JMD JOD JPY KES KGS KHR KMF KPW KRW KWD KYD KZT LAK LBP LKR LRD LSL LYD MAD MDL MGA MKD MMK MNT MOP MRU MUR MVR MWK MXN MXV MYR MZN NAD NGN NIO NOK NPR NZD OMR PAB PEN PGK PHP PKR PLN PYG QAR RON RSD RUB RWF SAR SBD SCR SDG SEK SGD SHP SLE SOS SRD SSP STN SVC SYP SZL THB TJS TMT TND TOP TRY TTD TWD TZS UAH UGX USD USN UYI UYU UYW UZS VED VES VND VUV WST XAF XAG XAU XBA XBB XBC XBD XCD XCG XDR XOF XPD XPF XPT XSU XTS XUA XXX YER ZAR ZMW ZWG".split(" ");
const intlWithCurrencyValues = Intl as typeof Intl & { supportedValuesOf?: (key: "currency") => string[] };
const currencyCodes = intlWithCurrencyValues.supportedValuesOf?.("currency") ?? fallbackCurrencyCodes;
const currencyNames = new Intl.DisplayNames(["en"], { type: "currency" });
const currencies = currencyCodes.map((code) => ({
  code,
  name: currencyNames.of(code) ?? code,
  symbol: new Intl.NumberFormat("en", { style: "currency", currency: code, currencyDisplay: "narrowSymbol" })
    .formatToParts(0)
    .find((part) => part.type === "currency")?.value ?? code,
}));

const demoTransactions: ExpenseTransaction[] = [
  { icon: "cart", name: "Whole Foods Market", category: "Groceries", date: "Today, 10:42 AM", amount: 84.23, currency: "USD", tone: "sage" },
  { icon: "coffee", name: "Juniper & Co.", category: "Dining out", date: "Yesterday, 8:15 AM", amount: 12.8, currency: "USD", tone: "peach" },
  { icon: "car", name: "Metro Transit", category: "Transport", date: "May 22, 6:30 PM", amount: 28, currency: "USD", tone: "blue" },
  { icon: "homeSmall", name: "Home Insurance", category: "Bills & utilities", date: "May 21, 9:00 AM", amount: 146.5, currency: "USD", tone: "sand" },
];

const categories = [
  { name: "Housing", value: 1240, percent: 62, color: "forest" },
  { name: "Food & dining", value: 486, percent: 46, color: "coral" },
  { name: "Transport", value: 214, percent: 29, color: "blue" },
  { name: "Lifestyle", value: 184, percent: 22, color: "gold" },
];

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:3001/api";
const USER_STORAGE_KEY = "hearthy-user";
const USER_SESSION_KEY = "hearthy-session";

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const sessionToken = sessionStorage.getItem(USER_SESSION_KEY);
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
      ...options.headers,
    },
  });

  let payload: any = null;
  try {
    payload = await response.json();
  } catch {
    payload = {};
  }

  if (!response.ok) {
    if (response.status === 401 && !path.startsWith("/admin/") && !path.startsWith("/auth/")) {
      sessionStorage.removeItem(USER_SESSION_KEY);
    }
    const error = new Error(payload?.error || "Request failed.") as Error & { statusCode: number };
    error.statusCode = response.status;
    throw error;
  }

  return payload as T;
}

function mapExpenseToTransaction(expense: any): ExpenseTransaction {
  return {
    id: expense.id,
    icon: (expense.icon as IconName) || "wallet",
    name: expense.name,
    category: expense.category,
    date: new Date(expense.date).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }),
    dateISO: expense.date,
    amount: Number(expense.amount) || 0,
    currency: expense.currency || "USD",
    tone: expense.tone || "sage",
    accountId: expense.accountId || "",
    tags: Array.isArray(expense.tags) ? expense.tags : [],
    receipt: expense.receipt || "",
  };
}

function parseCsvRecords(csv: string): Array<{ lineNumber: number; values: string[] }> {
  const records: Array<{ lineNumber: number; values: string[] }> = [];
  let values: string[] = [];
  let value = "";
  let quoted = false;
  let lineNumber = 1;
  let recordLine = 1;

  for (let index = 0; index < csv.length; index += 1) {
    const character = csv[index];
    if (quoted) {
      if (character === '"') {
        if (csv[index + 1] === '"') {
          value += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        if (character === "\n") lineNumber += 1;
        value += character;
      }
      continue;
    }

    if (character === '"' && value.length === 0) {
      quoted = true;
    } else if (character === ",") {
      values.push(value);
      value = "";
    } else if (character === "\r" || character === "\n") {
      values.push(value);
      if (values.some((cell) => cell.trim())) records.push({ lineNumber: recordLine, values });
      values = [];
      value = "";
      if (character === "\r" && csv[index + 1] === "\n") index += 1;
      lineNumber += 1;
      recordLine = lineNumber;
    } else {
      value += character;
    }
  }

  if (quoted) throw new Error("The CSV has an unclosed quoted field.");
  if (values.length > 0 || value.length > 0) {
    values.push(value);
    if (values.some((cell) => cell.trim())) records.push({ lineNumber: recordLine, values });
  }
  return records;
}

function normalizeCsvHeader(header: string): string {
  return header.replace(/^\uFEFF/, "").trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

function parseCsvDate(value: string): string | null {
  const trimmed = value.trim();
  const isoDate = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (isoDate) {
    const [, year, month, day] = isoDate;
    const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
    return date.getUTCFullYear() === Number(year) && date.getUTCMonth() === Number(month) - 1 && date.getUTCDate() === Number(day)
      ? `${year}-${month}-${day}T12:00:00.000Z`
      : null;
  }
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : `${parsed.toISOString().slice(0, 10)}T12:00:00.000Z`;
}

function parseCsvAmount(value: string): number {
  const trimmed = value.trim();
  const isParenthesizedNegative = /^\(.*\)$/.test(trimmed);
  let numeric = trimmed.replace(/[^\d.,+-]/g, "");
  if (numeric.includes(".") && numeric.includes(",")) {
    const decimalSeparator = numeric.lastIndexOf(".") > numeric.lastIndexOf(",") ? "." : ",";
    numeric = decimalSeparator === "."
      ? numeric.replace(/,/g, "")
      : numeric.replace(/\./g, "").replace(",", ".");
  } else if (numeric.includes(",")) {
    numeric = /,\d{1,2}$/.test(numeric) ? numeric.replace(",", ".") : numeric.replace(/,/g, "");
  }
  const amount = Number(numeric);
  return Number.isFinite(amount) ? Math.abs(isParenthesizedNegative ? -amount : amount) : Number.NaN;
}

function makeExpenseDuplicateKey(expense: Pick<ImportExpense, "name" | "amount" | "currency" | "date">): string {
  return [
    expense.date.slice(0, 10),
    expense.name.trim().toLocaleLowerCase(),
    Math.round(expense.amount * 100),
    expense.currency.toUpperCase(),
  ].join("|");
}

function previewExpenseCsv(
  csv: string,
  trackerCurrency: string,
  accounts: FinanceAccount[],
  existingExpenses: ExpenseTransaction[],
): { rows: CsvPreviewRow[]; ignoredRows: number } {
  const [headerRecord, ...dataRecords] = parseCsvRecords(csv);
  if (!headerRecord) throw new Error("The CSV file is empty.");

  const headers = headerRecord.values.map(normalizeCsvHeader);
  const findColumn = (...names: string[]) => headers.findIndex((header) => names.includes(header));
  const nameIndex = findColumn("name", "description", "merchant", "payee", "transaction name");
  const amountIndex = findColumn("amount", "transaction amount", "debit", "withdrawal", "spent", "value");
  const dateIndex = findColumn("date", "transaction date", "posted date");
  if (nameIndex < 0 || amountIndex < 0 || dateIndex < 0) {
    throw new Error("CSV needs columns for date, amount, and a transaction name (name, description, merchant, or payee).");
  }
  const categoryIndex = findColumn("category");
  const currencyIndex = findColumn("currency");
  const accountIndex = findColumn("account");
  const tagsIndex = findColumn("tags");
  const typeIndex = findColumn("type");
  const knownExpenses = new Set(existingExpenses.map((expense) => makeExpenseDuplicateKey({
    name: expense.name,
    amount: expense.amount,
    currency: expense.currency,
    date: expense.dateISO ?? expense.date,
  })));
  const accountByName = new Map(accounts.map((account) => [account.name.trim().toLocaleLowerCase(), account]));
  const rows: CsvPreviewRow[] = [];
  let ignoredRows = 0;

  for (const record of dataRecords) {
    const cell = (columnIndex: number) => columnIndex < 0 ? "" : (record.values[columnIndex] ?? "").trim();
    if (typeIndex >= 0 && cell(typeIndex) && cell(typeIndex).toLocaleLowerCase() !== "expense") {
      ignoredRows += 1;
      continue;
    }
    const name = cell(nameIndex);
    const amount = parseCsvAmount(cell(amountIndex));
    const date = parseCsvDate(cell(dateIndex));
    const rawCurrency = cell(currencyIndex) || trackerCurrency;
    const currency = rawCurrency.toUpperCase();
    const accountName = cell(accountIndex);
    const account = accountName ? accountByName.get(accountName.toLocaleLowerCase()) : undefined;
    let error: string | undefined;

    if (!name || name.length > 100) error = "Enter a transaction name between 1 and 100 characters.";
    else if (!Number.isFinite(amount) || amount <= 0) error = "Amount must be greater than zero.";
    else if (!date) error = "Enter a valid date.";
    else if (!/^[A-Z]{3}$/.test(currency)) error = "Currency must be a three-letter code.";
    else if (accountName && !account) error = `Account "${accountName}" was not found in Hearthy.`;

    const expense: ImportExpense | undefined = error ? undefined : {
      name,
      amount,
      category: cell(categoryIndex) || "Other",
      currency,
      date: date!,
      icon: "wallet",
      tone: "sage",
      accountId: account?.id ?? "",
      tags: cell(tagsIndex).split(/[;,]/).map((tag) => tag.trim()).filter(Boolean).slice(0, 20),
    };
    const duplicate = expense ? knownExpenses.has(makeExpenseDuplicateKey(expense)) : false;
    if (expense) knownExpenses.add(makeExpenseDuplicateKey(expense));
    rows.push({ lineNumber: record.lineNumber, expense, error, duplicate, selected: Boolean(expense && !duplicate) });
  }

  return { rows, ignoredRows };
}

function formatMoney(value: number, currency: string, compact = false) {
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency,
    notation: compact ? "compact" : "standard",
    minimumFractionDigits: compact ? 0 : 2,
    maximumFractionDigits: compact ? 1 : 2,
  }).format(value);
}

function getDueLabel(dueDate: string) {
  const due = new Date(`${dueDate}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dayDifference = Math.round((due.getTime() - today.getTime()) / 86_400_000);

  if (dayDifference < 0) return `Overdue by ${Math.abs(dayDifference)} day${dayDifference === -1 ? "" : "s"}`;
  if (dayDifference === 0) return "Due today";
  if (dayDifference === 1) return "Due tomorrow";
  return `Due in ${dayDifference} days`;
}

async function fileToReceipt(file: File): Promise<string> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 8 * 1024 * 1024) {
    throw new Error("Choose a JPG, PNG, or WebP receipt under 8 MB.");
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = objectUrl;
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Unable to read this receipt image."));
    });
    const scale = Math.min(1, 1400 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Receipt image processing is unavailable in this browser.");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.76);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function toBase64(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

function fromBase64(value: string) {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

async function encryptBackup(plainText: string, passphrase: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const passphraseKey = await crypto.subtle.importKey("raw", new TextEncoder().encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt, iterations: 310000 }, passphraseKey, { name: "AES-GCM", length: 256 }, false, ["encrypt"]);
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plainText));
  return JSON.stringify({ format: "hearthy-encrypted-backup", version: 1, kdf: "PBKDF2-SHA256", iterations: 310000, salt: toBase64(salt), iv: toBase64(iv), ciphertext: toBase64(new Uint8Array(ciphertext)) }, null, 2);
}

async function decryptBackup(envelope: Record<string, unknown>, passphrase: string) {
  if (envelope.format !== "hearthy-encrypted-backup" || envelope.version !== 1 || envelope.kdf !== "PBKDF2-SHA256" ||
    envelope.iterations !== 310000 || typeof envelope.salt !== "string" || typeof envelope.iv !== "string" || typeof envelope.ciphertext !== "string") {
    throw new Error("This is not a supported encrypted Hearthy backup.");
  }
  const salt = fromBase64(envelope.salt);
  const iv = fromBase64(envelope.iv);
  const ciphertext = fromBase64(envelope.ciphertext);
  const passphraseKey = await crypto.subtle.importKey("raw", new TextEncoder().encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt, iterations: 310000 }, passphraseKey, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
  const plainText = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  return JSON.parse(new TextDecoder().decode(plainText));
}

function parseExpenseDate(rawDate: string): Date | null {
  if (!rawDate) return null;

  const directDate = new Date(rawDate);
  if (!Number.isNaN(directDate.getTime())) {
    return directDate;
  }

  const lower = rawDate.toLowerCase();
  const now = new Date();

  if (lower.includes("today")) return new Date(now);
  if (lower.includes("yesterday")) {
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    return yesterday;
  }

  const fallback = new Date(rawDate.replace(" at ", " "));
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

function getPeriodRange(period: "This week" | "This month" | "This year") {
  const now = new Date();

  if (period === "This week") {
    const start = new Date(now);
    const day = start.getDay();
    const diff = (day === 0 ? -6 : 1 - day);
    start.setDate(start.getDate() + diff);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    return { start, end };
  }

  if (period === "This month") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return { start, end };
  }

  const start = new Date(now.getFullYear(), 0, 1);
  const end = new Date(now.getFullYear() + 1, 0, 1);
  return { start, end };
}

function getPreviousPeriodRange(period: "This week" | "This month" | "This year") {
  const now = new Date();

  if (period === "This week") {
    const { start, end } = getPeriodRange(period);
    start.setDate(start.getDate() - 7);
    end.setDate(end.getDate() - 7);
    return { start, end };
  }

  if (period === "This month") {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 1);
    return { start, end };
  }

  return {
    start: new Date(now.getFullYear() - 1, 0, 1),
    end: new Date(now.getFullYear(), 0, 1),
  };
}

function isWithinPeriod(date: Date, period: "This week" | "This month" | "This year") {
  const { start, end } = getPeriodRange(period);
  return date >= start && date < end;
}

function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, ReactNode> = {
    home: <><path d="m3 11 9-7 9 7" /><path d="M5 10v10h14V10M9 20v-6h6v6" /></>,
    history: <><path d="M3 12a9 9 0 1 0 2.6-6.4L3 8" /><path d="M3 3v5h5M12 7v5l3 2" /></>,
    wallet: <><path d="M4 6.5h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-12a2 2 0 0 1 2-2h11" /><path d="M16 11h5v5h-5a2.5 2.5 0 0 1 0-5Z" /></>,
    chart: <><path d="M4 19V9M10 19V5M16 19v-7M22 19H2" /></>,
    target: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3" /><path d="m14 10 6-6M16 4h4v4" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.6v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
    bell: <><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 7h18s-3 0-3-7M10 20h4" /></>,
    plus: <path d="M12 5v14M5 12h14" />,
    arrowUp: <><path d="m7 11 5-5 5 5M12 6v12" /></>,
    arrowDown: <><path d="m7 13 5 5 5-5M12 18V6" /></>,
    cart: <><path d="M3 4h2l2 11h10l3-8H6" /><circle cx="9" cy="19" r="1" /><circle cx="17" cy="19" r="1" /></>,
    coffee: <><path d="M5 9h12v6a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4V9Z" /><path d="M17 11h1a3 3 0 0 1 0 6h-2M8 5c0-1 1-1 1-2M12 5c0-1 1-1 1-2" /></>,
    car: <><path d="m5 10 2-5h10l2 5M4 10h16v7H4z" /><path d="M6 17v2M18 17v2" /><circle cx="7.5" cy="13.5" r="1" /><circle cx="16.5" cy="13.5" r="1" /></>,
    homeSmall: <><path d="m4 11 8-6 8 6" /><path d="M6 10v9h12v-9" /></>,
    chevron: <path d="m9 18 6-6-6-6" />,
    close: <path d="M6 6l12 12M18 6 6 18" />,
  };

  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

const membershipPlans = [
  { months: 4, total: 190, discount: 5 },
  { months: 6, total: 270, discount: 10 },
  { months: 8, total: 340, discount: 15 },
  { months: 12, total: 480, discount: 20 },
] as const;

function MembershipPlanPicker({
  value,
  onChange,
}: {
  value: number;
  onChange: (months: number) => void;
}) {
  return (
    <fieldset className="membership-plan-picker">
      <legend>Choose your plan</legend>
      {membershipPlans.map((plan) => (
        <label className={`membership-plan-option${value === plan.months ? " selected" : ""}`} key={plan.months}>
          <input type="radio" name="membership-plan" value={plan.months} checked={value === plan.months} onChange={() => onChange(plan.months)} />
          <span className="membership-plan-duration">{plan.months} months</span>
          <span className="membership-plan-pricing"><strong>${plan.total}</strong><small>${(plan.total / plan.months).toFixed(2)}/month · save {plan.discount}%</small></span>
        </label>
      ))}
      <small className="membership-plan-note">One-time upfront payment in USD. No automatic renewal. Plans are based on $50/month with a longer-term discount.</small>
    </fieldset>
  );
}

function AuthPage({
  mode,
  setMode,
  onSubmit,
  loading,
  error,
}: {
  mode: "login" | "signup" | "admin" | "reset";
  setMode: (mode: "login" | "signup" | "admin" | "reset") => void;
  onSubmit: (payload: { name?: string; email: string; username?: string; password: string }) => Promise<void> | void;
  loading: boolean;
  error?: string;
}) {
  const isSignup = mode === "signup";
  const isAdmin = mode === "admin";
  const isReset = mode === "reset";
  const resetToken = new URLSearchParams(window.location.search).get("reset");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  function changeMode(nextMode: typeof mode) {
    setName("");
    setEmail("");
    setUsername("");
    setPassword("");
    setMode(nextMode);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await onSubmit({ name: isSignup ? name : undefined, email, username: isAdmin ? username : undefined, password });
    } finally {
      setPassword("");
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-story">
        <div className="brand auth-brand">
          <div className="brand-mark"><span /><span /><span /></div>
          <strong>hearthy</strong>
        </div>
        <div className="auth-story-copy">
          <p className="eyebrow">Money, made mindful</p>
          <h1>Feel at home with your finances.</h1>
          <p>Plan with confidence, spend with intention, and grow toward what matters most.</p>
        </div>
        <div className="auth-preview" aria-hidden="true">
          <div className="preview-top">
            <span>Monthly balance</span>
            <i>On track</i>
          </div>
          <strong>$8,426.20</strong>
          <div className="preview-chart">
            <span /><span /><span /><span /><span /><span /><span />
          </div>
          <div className="preview-insight"><b>12%</b><span>less spent on dining this week</span></div>
        </div>
        <p className="auth-quote">“Hearthy helped us turn money talks into plans we’re excited about.”</p>
      </section>

      <section className="auth-form-side">
        <div className="auth-form-wrap">
          <div className="auth-mobile-brand brand">
            <div className="brand-mark"><span /><span /><span /></div>
            <strong>hearthy</strong>
          </div>
          <div className="auth-heading" key={`heading-${mode}`}>
            <p className="eyebrow">{isAdmin ? "Administrator" : isSignup ? "Start your journey" : isReset ? "Account recovery" : "Welcome back"}</p>
            <h2>{isAdmin ? "Admin sign in" : isSignup ? "Create your account" : isReset ? resetToken ? "Choose a new password" : "Reset your password" : "Sign in to Hearthy"}</h2>
            <p>{isAdmin ? "Sign in to review system activity and spending." : isSignup ? "Create your account first. Choose a plan after signing in to unlock Hearthy." : isReset ? resetToken ? "Use at least 12 characters for your new password." : "We’ll send a secure reset link if your account exists." : "Your financial home is right where you left it."}</p>
          </div>

          {!isAdmin && !isReset && <div className="auth-tabs" role="tablist" aria-label="Account access">
            <button type="button" role="tab" aria-selected={!isSignup} className={!isSignup ? "active" : ""} onClick={() => changeMode("login")}>Log in</button>
            <button type="button" role="tab" aria-selected={isSignup} className={isSignup ? "active" : ""} onClick={() => changeMode("signup")}>Sign up</button>
          </div>}

          <form key={`form-${mode}`} className="auth-form" autoComplete="off" onSubmit={handleSubmit}>
            {isAdmin ? (
              <label>
                Admin username
                <input required autoComplete="off" value={username} onChange={(event) => setUsername(event.target.value)} />
              </label>
            ) : isSignup && (
              <label>
                Full name
                <input required autoComplete="off" placeholder="Alex Morgan" value={name} onChange={(event) => setName(event.target.value)} />
              </label>
            )}
            {!isAdmin && <label>
              Email address
              <input required type="email" autoComplete="off" placeholder="alex@example.com" value={email} onChange={(event) => setEmail(event.target.value)} />
            </label>}
            {(!isReset || resetToken) && <label>
              <span className="label-row">Password</span>
              <input required minLength={isSignup || isReset ? 12 : undefined} type="password" autoComplete="new-password" placeholder={isSignup || isReset ? "At least 12 characters" : "Enter your password"} value={password} onChange={(event) => setPassword(event.target.value)} />
            </label>}
            {error && <div className="auth-error">{error}</div>}
            <button className="primary-button auth-submit" type="submit" disabled={loading}>{loading ? "Please wait..." : isAdmin ? "Sign in as admin" : isSignup ? "Create account" : isReset ? resetToken ? "Update password" : "Send reset link" : "Log in"}</button>
          </form>
          {isReset ? <button className="auth-admin-link" type="button" onClick={() => { window.history.replaceState({}, "", window.location.pathname); changeMode("login"); }}>Back to sign in</button> : isAdmin ? <button className="auth-admin-link" type="button" onClick={() => changeMode("login")}>Back to user sign in</button> : <>
            {!isSignup && <button className="auth-admin-link" type="button" onClick={() => changeMode("reset")}>Forgot password?</button>}
            <button className="auth-admin-link" type="button" onClick={() => changeMode("admin")}>Administrator sign in</button>
          </>}
        </div>
      </section>
    </main>
  );
}

function MembershipRenewalPage({
  email,
  expiresAt,
  cancelled,
  loading,
  demoPaymentsEnabled,
  error,
  onRenew,
  onDemoPayment,
  onSignOut,
}: {
  email: string;
  expiresAt: string;
  cancelled: boolean;
  loading: boolean;
  demoPaymentsEnabled: boolean | null;
  error: string;
  onRenew: (months: number) => Promise<void>;
  onDemoPayment: (months: number) => Promise<void>;
  onSignOut: () => void;
}) {
  const [months, setMonths] = useState(4);
  return (
    <main className="membership-renewal-page">
      <section className="membership-renewal-card">
        <div className="brand auth-mobile-brand">
          <div className="brand-mark"><span /><span /><span /></div>
          <strong>hearthy</strong>
        </div>
        <p className="eyebrow">{expiresAt ? "Membership ended" : "Account created"}</p>
        <h1>{expiresAt ? "Renew your Hearthy plan" : "Choose a plan to continue"}</h1>
        <p>{expiresAt
          ? <>Your plan for <strong>{email}</strong> expired on {new Date(expiresAt).toLocaleDateString()}. Choose another one-time plan to restore access.</>
          : <>Your account for <strong>{email}</strong> is ready. Choose a one-time plan to unlock Hearthy features.</>}</p>
        <MembershipPlanPicker value={months} onChange={setMonths} />
        {demoPaymentsEnabled && <div className="membership-demo-notice" role="status">
          <strong>Demo payment mode</strong>
          <span>No money will be charged. Click below to activate the selected plan and continue into Hearthy.</span>
        </div>}
        {cancelled && <div className="auth-error" role="status">Checkout was cancelled. Your account is still here; access will return after a successful payment.</div>}
        {error && <div className="auth-error" role="alert">{error}</div>}
        <button
          type="button"
          className="primary-button auth-submit"
          disabled={loading || demoPaymentsEnabled === null}
          onClick={() => void (demoPaymentsEnabled ? onDemoPayment(months) : onRenew(months))}
        >
          {loading ? "Activating your plan..." : demoPaymentsEnabled === null ? "Checking payment options..." : demoPaymentsEnabled ? "Continue to Hearthy — no payment required" : "Continue to secure payment"}
        </button>
        <button type="button" className="auth-admin-link" onClick={onSignOut}>Sign out</button>
      </section>
    </main>
  );
}

type AdminOverview = {
  totalUsers: number;
  totalTrackers: number;
  totalExpenses: number;
  amountByCurrency: Record<string, number>;
  users: Array<{
    id: string;
    name: string;
    email: string;
    createdAt: string;
    trackers: Array<{
      id: string;
      name: string;
      currency: string;
      budget: number;
      expenseCount: number;
      totalExpense: number;
    }>;
  }>;
  recentExpenses: Array<{
    id: string;
    name: string;
    amount: number;
    currency: string;
    category: string;
    date: string;
    userName?: string;
    userEmail?: string;
    trackerName?: string;
  }>;
};

function AdminDashboard({ data, onSignOut }: { data: AdminOverview; onSignOut: () => void }) {
  const [userSearch, setUserSearch] = useState("");
  const [expenseSearch, setExpenseSearch] = useState("");
  const [activeTab, setActiveTab] = useState<"users" | "expenses">("users");
  const users = data.users.filter((user) =>
    `${user.name} ${user.email}`.toLowerCase().includes(userSearch.trim().toLowerCase()),
  );
  const expenses = data.recentExpenses.filter((expense) =>
    `${expense.name} ${expense.category} ${expense.userName ?? ""} ${expense.userEmail ?? ""}`
      .toLowerCase()
      .includes(expenseSearch.trim().toLowerCase()),
  );
  const totalTrackedAmounts = Object.entries(data.amountByCurrency);

  return (
    <main className="admin-page">
      <div className="admin-shell">
        <header className="admin-header">
          <div className="admin-brand-lockup">
            <div className="admin-brand-mark"><span /><span /><span /></div>
            <span>hearthy <small>ADMIN</small></span>
          </div>
          <button type="button" className="admin-signout" onClick={onSignOut}>Sign out</button>
        </header>

        <section className="admin-welcome">
          <div>
            <p className="eyebrow">System administration</p>
            <h1>Hearthy overview</h1>
            <p>Review registered accounts, trackers, and customer-entered expense activity.</p>
          </div>
          <div className="admin-live"><i /> Current system data</div>
        </section>

        <section className="admin-metrics" aria-label="System totals">
          <article className="admin-metric-card">
            <span className="admin-metric-icon users"><Icon name="target" size={19} /></span>
            <span className="admin-metric-label">Customer accounts</span>
            <strong>{data.totalUsers.toLocaleString()}</strong>
            <small>All registered accounts</small>
          </article>
          <article className="admin-metric-card">
            <span className="admin-metric-icon trackers"><Icon name="wallet" size={19} /></span>
            <span className="admin-metric-label">Trackers created</span>
            <strong>{data.totalTrackers.toLocaleString()}</strong>
            <small>Personal finance spaces across accounts</small>
          </article>
          <article className="admin-metric-card">
            <span className="admin-metric-icon expenses"><Icon name="chart" size={19} /></span>
            <span className="admin-metric-label">Expense records</span>
            <strong>{data.totalExpenses.toLocaleString()}</strong>
            <small>All saved expenses across trackers</small>
          </article>
          <article className="admin-metric-card admin-currency-card">
            <span className="admin-metric-icon amounts"><Icon name="arrowDown" size={19} /></span>
            <span className="admin-metric-label">Recorded spending</span>
            {totalTrackedAmounts.length > 0 ? (
              <div className="admin-currency-totals">
                {totalTrackedAmounts.map(([currency, amount]) => <strong key={currency}>{formatMoney(amount, currency)} <small>{currency}</small></strong>)}
              </div>
            ) : <strong className="admin-no-data">No expenses yet</strong>}
            <small>All-time expense sum, grouped by currency</small>
          </article>
        </section>
        <p className="admin-data-note"><strong>How to read these totals:</strong> Counts and recorded spending include all saved records, not just recent activity. Currency totals are kept separate and represent customer spending—not Hearthy revenue.</p>

        <section className="admin-activity-panel">
          <div className="admin-section-heading">
            <div>
              <p className="eyebrow">Customer data</p>
              <h2>Accounts & expenses</h2>
              <p>Choose a view to inspect customer account summaries or recent expense records.</p>
            </div>
            <div className="admin-tabs" role="tablist" aria-label="Admin activity view">
              <button type="button" role="tab" aria-selected={activeTab === "users"} className={activeTab === "users" ? "selected" : ""} onClick={() => setActiveTab("users")}>Accounts <span>{data.totalUsers}</span></button>
              <button type="button" role="tab" aria-selected={activeTab === "expenses"} className={activeTab === "expenses" ? "selected" : ""} onClick={() => setActiveTab("expenses")}>Recent expenses <span>{data.recentExpenses.length}</span></button>
            </div>
          </div>

          {activeTab === "users" ? (
            <section className="admin-data-view" aria-label="User activity">
              <div className="admin-data-toolbar">
                <div><strong>Customer accounts</strong><small>Showing {users.length} of {data.totalUsers}</small></div>
                <label className="admin-search"><Icon name="search" size={16} /><input type="search" value={userSearch} onChange={(event) => setUserSearch(event.target.value)} placeholder="Search by name or email" aria-label="Search users" /></label>
              </div>
              <div className="admin-table-scroll">
                <table className="admin-table">
                  <thead><tr><th>Customer</th><th>Trackers</th><th>Expense records</th><th>Account created</th></tr></thead>
                  <tbody>
                    {users.map((entry) => {
                      const expenseCount = entry.trackers.reduce((sum, tracker) => sum + tracker.expenseCount, 0);
                      const trackerTotals = entry.trackers.map((tracker) => `${formatMoney(tracker.totalExpense, tracker.currency)} · ${tracker.name}`);
                      const initials = entry.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
                      return <tr key={entry.id}>
                        <td><span className="admin-user-cell"><i>{initials}</i><span><strong>{entry.name}</strong><small>{entry.email}</small></span></span></td>
                        <td><span className="admin-count-pill">{entry.trackers.length}</span></td>
                        <td><strong>{expenseCount}</strong>{trackerTotals.length > 0 && <small className="admin-spend-detail" title="Total recorded spending by tracker">{trackerTotals.join("  /  ")}</small>}</td>
                        <td>{new Date(entry.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</td>
                      </tr>;
                    })}
                    {users.length === 0 && <tr><td colSpan={4} className="admin-empty">No users match that search.</td></tr>}
                  </tbody>
                </table>
              </div>
            </section>
          ) : (
            <section className="admin-data-view" aria-label="Recent expenses">
              <div className="admin-data-toolbar">
                <div><strong>Latest expense records</strong><small>Showing {expenses.length} of {data.recentExpenses.length} loaded · up to 25 most recent across Hearthy</small></div>
                <label className="admin-search"><Icon name="search" size={16} /><input type="search" value={expenseSearch} onChange={(event) => setExpenseSearch(event.target.value)} placeholder="Search expense, category, or user" aria-label="Search expenses" /></label>
              </div>
              <div className="admin-table-scroll">
                <table className="admin-table">
                  <thead><tr><th>Expense</th><th>User</th><th>Category</th><th>Amount</th><th>Date</th></tr></thead>
                  <tbody>
                    {expenses.map((expense) => <tr key={expense.id}>
                      <td><strong>{expense.name}</strong>{expense.trackerName && <small className="admin-spend-detail">{expense.trackerName}</small>}</td>
                      <td>{expense.userName ?? expense.userEmail ?? "—"}{expense.userName && <small className="admin-spend-detail">{expense.userEmail}</small>}</td>
                      <td><span className="admin-category-pill">{expense.category}</span></td>
                      <td><strong className="admin-expense-amount">-{formatMoney(expense.amount, expense.currency)}</strong></td>
                      <td>{new Date(expense.date).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</td>
                    </tr>)}
                    {expenses.length === 0 && <tr><td colSpan={5} className="admin-empty">No expenses match that search.</td></tr>}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </section>

        <footer className="admin-footer"><span>Hearthy Admin</span><span>Customer finance data · Admin access only</span></footer>
      </div>
    </main>
  );
}

function TrackerSetup({
  onComplete,
  onBack,
}: {
  onComplete: (config: TrackerConfig) => void;
  onBack: () => void;
}) {
  const [name, setName] = useState("My everyday expenses");
  const [currency, setCurrency] = useState("USD");
  const [context, setContext] = useState("Everything");
  const [destination, setDestination] = useState("");
  const contexts = [
    { label: "Everything", detail: "One home for every expense", icon: "wallet" as IconName },
    { label: "Everyday", detail: "Daily life and recurring bills", icon: "home" as IconName },
    { label: "Local trip", detail: "Travel within your country", icon: "car" as IconName },
    { label: "Foreign trip", detail: "Travel in another currency", icon: "chart" as IconName },
  ];

  return (
    <main className="setup-page">
      <header className="setup-header">
        <div className="brand">
          <div className="brand-mark"><span /><span /><span /></div>
          <strong>hearthy</strong>
        </div>
        <button type="button" onClick={onBack}>Back to sign in</button>
      </header>
      <section className="setup-card">
        <div className="setup-progress"><span /><span /><span /></div>
        <p className="eyebrow">Your first tracker</p>
        <h1>What would you like to track?</h1>
        <p className="setup-intro">Give this expense space a name and shape it around everyday life, a local getaway, or your next trip abroad.</p>

        <form onSubmit={(event) => {
          event.preventDefault();
          onComplete({ name, currency, context, destination });
        }}>
          <label className="setup-label">
            Name your expense tracker
            <input required value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Summer in Tokyo" />
            <small>You can create more trackers later.</small>
          </label>

          <fieldset>
            <legend>What are you tracking?</legend>
            <div className="context-grid">
              {contexts.map((item) => (
                <button type="button" className={context === item.label ? "selected" : ""} onClick={() => setContext(item.label)} key={item.label}>
                  <Icon name={item.icon} />
                  <span><strong>{item.label}</strong><small>{item.detail}</small></span>
                  <i />
                </button>
              ))}
            </div>
          </fieldset>

          <div className="setup-row">
            <label className="setup-label">
              Main currency
              <select value={currency} onChange={(event) => setCurrency(event.target.value)}>
                {currencies.map((item) => <option key={item.code} value={item.code}>{item.symbol} · {item.code} — {item.name}</option>)}
              </select>
              <small>Transactions can still use other currencies.</small>
            </label>
            <label className="setup-label">
              {context === "Foreign trip" ? "Destination country" : "Place or destination"}
              <input value={destination} onChange={(event) => setDestination(event.target.value)} placeholder={context === "Foreign trip" ? "e.g. Japan" : "Optional"} />
              <small>Useful for trips and location reports.</small>
            </label>
          </div>

          <div className="multi-currency-note">
            <span><Icon name="chart" /></span>
            <p><strong>Travel without the math.</strong> Add expenses in any local currency and Hearthy will keep totals in your main currency.</p>
          </div>

          <button className="primary-button setup-submit" type="submit">Start tracking <Icon name="chevron" size={17} /></button>
        </form>
      </section>
    </main>
  );
}

export default function App() {
  const [activeNav, setActiveNav] = useState(() => {
    try {
      const savedPage = localStorage.getItem("hearthy-active-page");
      return ["Overview", "Transactions", "History", "Analytics", "Goals", "Finance", "Settings"].includes(savedPage ?? "")
        ? savedPage!
        : "Overview";
    } catch {
      return "Overview";
    }
  });
  const [transactionSearch, setTransactionSearch] = useState(() => {
    try { return localStorage.getItem("hearthy-transaction-search") ?? ""; } catch { return ""; }
  });
  const [transactionCategory, setTransactionCategory] = useState(() => {
    try { return localStorage.getItem("hearthy-transaction-category") ?? "All categories"; } catch { return "All categories"; }
  });
  const [historySearch, setHistorySearch] = useState(() => {
    try { return localStorage.getItem("hearthy-history-search") ?? ""; } catch { return ""; }
  });
  const [historyKind, setHistoryKind] = useState(() => {
    try { return localStorage.getItem("hearthy-history-kind") ?? "All activity"; } catch { return "All activity"; }
  });
  const [historyDateFilter, setHistoryDateFilter] = useState<"All time" | "This month" | "This year" | "Custom">(() => {
    try {
      const savedFilter = localStorage.getItem("hearthy-history-date-filter");
      return ["All time", "This month", "This year", "Custom"].includes(savedFilter ?? "") ? savedFilter as "All time" | "This month" | "This year" | "Custom" : "All time";
    } catch { return "All time"; }
  });
  const [historyStartDate, setHistoryStartDate] = useState(() => {
    try { return localStorage.getItem("hearthy-history-start-date") ?? ""; } catch { return ""; }
  });
  const [historyEndDate, setHistoryEndDate] = useState(() => {
    try { return localStorage.getItem("hearthy-history-end-date") ?? ""; } catch { return ""; }
  });
  const [historyActivities, setHistoryActivities] = useState<HistoryActivity[]>([]);
  const [historyError, setHistoryError] = useState("");
  const [loadingHistory, setLoadingHistory] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [period, setPeriod] = useState<"This week" | "This month" | "This year">("This month");
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState<"budget" | "expense" | "income" | "goal" | "transaction-detail" | "import" | "loan" | "tracker">("expense");
  const [selectedTransaction, setSelectedTransaction] = useState<ExpenseTransaction | null>(null);
  const [undoNotice, setUndoNotice] = useState<{ message: string; restore: () => Promise<void> } | null>(null);
  const undoTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    try {
      return Boolean(localStorage.getItem(USER_STORAGE_KEY));
    } catch {
      return false;
    }
  });
  const [authMode, setAuthMode] = useState<"login" | "signup" | "admin" | "reset">(() =>
    new URLSearchParams(window.location.search).has("reset") ? "reset" : "login",
  );
  const [membershipExpired, setMembershipExpired] = useState(false);
  const [demoPaymentsEnabled, setDemoPaymentsEnabled] = useState<boolean | null>(null);
  const [adminToken, setAdminToken] = useState(() => {
    try {
      return sessionStorage.getItem("hearthy-admin-token");
    } catch {
      return null;
    }
  });
  const [adminOverview, setAdminOverview] = useState<AdminOverview | null>(null);
  const [adminLoadError, setAdminLoadError] = useState("");
  const [showSetup, setShowSetup] = useState(false);
  const [user, setUser] = useState<User | null>(() => {
    try {
      const stored = localStorage.getItem(USER_STORAGE_KEY);
      return stored ? (JSON.parse(stored) as User) : null;
    } catch {
      return null;
    }
  });
  const [loadingAccount, setLoadingAccount] = useState(() => {
    try {
      return Boolean(localStorage.getItem(USER_STORAGE_KEY));
    } catch {
      return false;
    }
  });
  const [trackers, setTrackers] = useState<TrackerConfig[]>([]);
  const [loadingTracker, setLoadingTracker] = useState(false);
  const [creatingTracker, setCreatingTracker] = useState(false);
  const [trackerFormError, setTrackerFormError] = useState("");
  const [newTrackerName, setNewTrackerName] = useState("");
  const [newTrackerContext, setNewTrackerContext] = useState("Everyday");
  const [newTrackerCurrency, setNewTrackerCurrency] = useState("USD");
  const [newTrackerDestination, setNewTrackerDestination] = useState("");
  const [newTrackerBudget, setNewTrackerBudget] = useState("");
  const [budget, setBudget] = useState(11579);
  const [userTransactions, setUserTransactions] = useState<ExpenseTransaction[]>(demoTransactions);
  const [moneyRecords, setMoneyRecords] = useState<MoneyRecord[]>([]);
  const [incomeRecords, setIncomeRecords] = useState<IncomeRecord[]>([]);
  const [recurringRecords, setRecurringRecords] = useState<RecurringRecord[]>([]);
  const [savingsGoals, setSavingsGoals] = useState<SavingsGoal[]>([]);
  const [financeAccounts, setFinanceAccounts] = useState<FinanceAccount[]>([]);
  const [customCategories, setCustomCategories] = useState<CustomCategory[]>([]);
  const [financeMessage, setFinanceMessage] = useState("");
  const [financeError, setFinanceError] = useState("");
  const [savingFinance, setSavingFinance] = useState(false);
  const [incomeName, setIncomeName] = useState("");
  const [incomeAmount, setIncomeAmount] = useState("");
  const [editingIncomeId, setEditingIncomeId] = useState("");
  const [incomeDate, setIncomeDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [incomeCategory, setIncomeCategory] = useState("Salary");
  const [incomeAccount, setIncomeAccount] = useState("");
  const [incomeCurrency, setIncomeCurrency] = useState("USD");
  const [editingRecurringId, setEditingRecurringId] = useState("");
  const [recurringName, setRecurringName] = useState("");
  const [recurringAmount, setRecurringAmount] = useState("");
  const [recurringCurrency, setRecurringCurrency] = useState("USD");
  const [recurringDue, setRecurringDue] = useState(() => new Date().toISOString().slice(0, 10));
  const [recurringFrequency, setRecurringFrequency] = useState<RecurringRecord["frequency"]>("monthly");
  const [recurringKind, setRecurringKind] = useState<"income" | "expense">("expense");
  const [recurringAccount, setRecurringAccount] = useState("");
  const [goalName, setGoalName] = useState("");
  const [goalTarget, setGoalTarget] = useState("");
  const [goalDate, setGoalDate] = useState("");
  const [goalContribution, setGoalContribution] = useState("");
  const [contributingGoalId, setContributingGoalId] = useState("");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryKind, setNewCategoryKind] = useState<CustomCategory["kind"]>("expense");
  const [newAccountName, setNewAccountName] = useState("");
  const [newAccountType, setNewAccountType] = useState("checking");
  const [newAccountBalance, setNewAccountBalance] = useState("0");
  const [accountTransfers, setAccountTransfers] = useState<AccountTransfer[]>([]);
  const [transferFrom, setTransferFrom] = useState("");
  const [transferTo, setTransferTo] = useState("");
  const [transferAmount, setTransferAmount] = useState("");
  const [reconcileAccountId, setReconcileAccountId] = useState("");
  const [receiptOnly, setReceiptOnly] = useState(false);
  const [browserRemindersEnabled, setBrowserRemindersEnabled] = useState(() => localStorage.getItem("hearthy-browser-reminders") === "enabled");
  const [profileForm, setProfileForm] = useState({
    username: "",
    bio: "",
    avatar: "",
    emailReminders: true,
    browserReminders: true,
    weeklyDigest: true,
  });
  const [profileError, setProfileError] = useState("");
  const [profileMessage, setProfileMessage] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isDemoAccount, setIsDemoAccount] = useState(true);
  const [budgetInput, setBudgetInput] = useState("");
  const [budgetMode, setBudgetMode] = useState<"increase" | "set-total">("increase");
  const [budgetError, setBudgetError] = useState("");
  const [savingBudget, setSavingBudget] = useState(false);
  const [expenseName, setExpenseName] = useState("");
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseDate, setExpenseDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [expenseError, setExpenseError] = useState("");
  const [savingExpense, setSavingExpense] = useState(false);
  const [csvPreviewRows, setCsvPreviewRows] = useState<CsvPreviewRow[]>([]);
  const [csvIgnoredRows, setCsvIgnoredRows] = useState(0);
  const [csvImportError, setCsvImportError] = useState("");
  const [savingCsvImport, setSavingCsvImport] = useState(false);
  const [moneyRecordId, setMoneyRecordId] = useState<string | null>(null);
  const [moneyDirection, setMoneyDirection] = useState<"borrowed" | "lent">("borrowed");
  const [moneyPerson, setMoneyPerson] = useState("");
  const [moneyAmount, setMoneyAmount] = useState("");
  const [moneyCurrency, setMoneyCurrency] = useState("USD");
  const [moneyDueDate, setMoneyDueDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [moneyNote, setMoneyNote] = useState("");
  const [moneyError, setMoneyError] = useState("");
  const [savingMoneyRecord, setSavingMoneyRecord] = useState(false);
  const [expenseCategory, setExpenseCategory] = useState("Groceries");
  const [expenseCurrency, setExpenseCurrency] = useState("USD");
  const [expenseAccount, setExpenseAccount] = useState("");
  const [expenseTagsInput, setExpenseTagsInput] = useState("");
  const [expenseReceipt, setExpenseReceipt] = useState("");
  const [authError, setAuthError] = useState("");
  const [loadingAuth, setLoadingAuth] = useState(false);
  const [tracker, setTracker] = useState<TrackerConfig>({
    name: "My everyday expenses",
    currency: "USD",
    context: "Everything",
    destination: "",
  });

  useEffect(() => {
    try {
      localStorage.setItem("hearthy-active-page", activeNav);
      localStorage.setItem("hearthy-transaction-search", transactionSearch);
      localStorage.setItem("hearthy-transaction-category", transactionCategory);
      localStorage.setItem("hearthy-history-search", historySearch);
      localStorage.setItem("hearthy-history-kind", historyKind);
      localStorage.setItem("hearthy-history-date-filter", historyDateFilter);
      localStorage.setItem("hearthy-history-start-date", historyStartDate);
      localStorage.setItem("hearthy-history-end-date", historyEndDate);
    } catch (error) {
      console.warn("Unable to save page and filter preferences.", error);
    }
  }, [activeNav, transactionSearch, transactionCategory, historySearch, historyKind, historyDateFilter, historyStartDate, historyEndDate]);

  useEffect(() => {
    const handleSearchShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleSearchShortcut);
    return () => window.removeEventListener("keydown", handleSearchShortcut);
  }, []);

  useEffect(() => {
    if (user) {
      localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(USER_STORAGE_KEY);
    }
  }, [user]);

  useEffect(() => {
    let active = true;
    apiFetch<{ demoPaymentsEnabled: boolean }>("/billing/config")
      .then((config) => {
        if (active) setDemoPaymentsEnabled(config.demoPaymentsEnabled);
      })
      .catch((error: unknown) => {
        console.error("Unable to load billing configuration.", error);
        if (active) setDemoPaymentsEnabled(false);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!user) return;
    const notificationPreferences = user.notificationPreferences || {
      emailReminders: true,
      browserReminders: true,
      weeklyDigest: true,
    };
    const nextBrowserReminders = notificationPreferences.browserReminders ?? (localStorage.getItem("hearthy-browser-reminders") === "enabled");
    setBrowserRemindersEnabled(nextBrowserReminders);
    localStorage.setItem("hearthy-browser-reminders", nextBrowserReminders ? "enabled" : "disabled");
    setProfileForm({
      username: user.username || user.name.replace(/\s+/g, '').slice(0, 24) || "user",
      bio: user.bio || "",
      avatar: user.avatar || "",
      emailReminders: notificationPreferences.emailReminders,
      browserReminders: nextBrowserReminders,
      weeklyDigest: notificationPreferences.weeklyDigest,
    });
  }, [user]);

  useEffect(() => {
    const expiration = Date.parse(user?.membershipExpiresAt || "");
    if (!Number.isFinite(expiration)) return;
    let timer: ReturnType<typeof setTimeout>;
    const updateAccessState = () => {
      const remaining = expiration - Date.now();
      if (remaining <= 0) {
        setMembershipExpired(true);
      } else {
        timer = setTimeout(updateAccessState, Math.min(remaining, 2_000_000_000));
      }
    };
    updateAccessState();
    return () => clearTimeout(timer);
  }, [user?.membershipExpiresAt]);

  useEffect(() => {
    if (adminToken) {
      sessionStorage.setItem("hearthy-admin-token", adminToken);
      setAdminLoadError("");
      apiFetch<AdminOverview>("/admin/overview", {
        headers: { Authorization: `Bearer ${adminToken}` },
      }).then(setAdminOverview).catch((error: unknown) => {
        setAdminToken(null);
        setAdminOverview(null);
        sessionStorage.removeItem("hearthy-admin-token");
        setAdminLoadError(error instanceof Error ? error.message : "Unable to load admin overview.");
      });
    } else {
      sessionStorage.removeItem("hearthy-admin-token");
      setAdminOverview(null);
    }
  }, [adminToken]);

  useEffect(() => {
    const hasReturnedMembershipCheckout = new URLSearchParams(window.location.search).get("membership") === "success";
    if (!user || (membershipExpired && !hasReturnedMembershipCheckout)) {
      return;
    }

    const syncUserAccount = async () => {
      try {
        const currentUrl = new URL(window.location.href);
        const membershipSessionId = currentUrl.searchParams.get("membership") === "success"
          ? currentUrl.searchParams.get("session_id")
          : null;
        if (membershipSessionId) {
          const membership = await apiFetch<{ membershipExpiresAt: string; membershipPlanMonths: number }>("/billing/membership/complete", {
            method: "POST",
            body: JSON.stringify({ checkoutSessionId: membershipSessionId }),
          });
          setUser((current) => current ? {
            ...current,
            membershipExpiresAt: membership.membershipExpiresAt,
            membershipPlanMonths: membership.membershipPlanMonths,
          } : current);
          setMembershipExpired(false);
          currentUrl.searchParams.delete("membership");
          currentUrl.searchParams.delete("session_id");
          window.history.replaceState({}, "", `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`);
        }
        const response = await apiFetch<{ trackers: TrackerConfig[] }>(`/users/${user.id}/trackers`);
        setMembershipExpired(false);
        setTrackers(response.trackers);
        const savedTrackerId = localStorage.getItem(`hearthy-active-tracker-${user.id}`);
        const tracked = response.trackers.find((entry) => entry.id === savedTrackerId) ?? response.trackers[0];

        if (tracked) {
          await loadTrackerData(tracked);
        } else {
          setTracker({ name: "My everyday expenses", currency: "USD", context: "Everyday", destination: "" });
          setBudget(0);
          setUserTransactions([]);
          setMoneyRecords([]);
          setIncomeRecords([]);
          setRecurringRecords([]);
          setSavingsGoals([]);
          setFinanceAccounts([]);
          setCustomCategories([]);
          setAccountTransfers([]);
          setIsDemoAccount(false);
          setShowSetup(true);
          setIsAuthenticated(true);
        }
      } catch (error) {
        console.error("Unable to load the signed-in account.", error);
        const statusCode = error instanceof Error ? (error as Error & { statusCode?: number }).statusCode : undefined;
        if (statusCode === 402) {
          setMembershipExpired(true);
          setIsAuthenticated(true);
          setAuthError("");
        } else {
          setUser(null);
          setIsAuthenticated(false);
          setAuthError(error instanceof Error ? error.message : "Your session expired. Please sign in again.");
        }
      } finally {
        setLoadingAccount(false);
      }
    };

    void syncUserAccount();
  }, [user, membershipExpired]);

  async function loadTrackerData(tracked: TrackerConfig) {
    if (!tracked.id) throw new Error("This tracker is missing its ID.");
    setLoadingTracker(true);
    try {
      const [expensesResponse, loansResponse, incomeResponse, recurringResponse, goalsResponse, accountsResponse, categoriesResponse, transfersResponse] = await Promise.all([
        apiFetch<{ expenses: any[] }>(`/trackers/${tracked.id}/expenses`),
        apiFetch<{ loans: MoneyRecord[] }>(`/trackers/${tracked.id}/loans`),
        apiFetch<{ incomes: IncomeRecord[] }>(`/trackers/${tracked.id}/incomes`),
        apiFetch<{ recurring: RecurringRecord[] }>(`/trackers/${tracked.id}/recurring`),
        apiFetch<{ goals: SavingsGoal[] }>(`/trackers/${tracked.id}/goals`),
        apiFetch<{ accounts: FinanceAccount[] }>(`/trackers/${tracked.id}/accounts`),
        apiFetch<{ categories: CustomCategory[] }>(`/trackers/${tracked.id}/categories`),
        apiFetch<{ transfers: AccountTransfer[] }>(`/trackers/${tracked.id}/transfers`),
      ]);
      setTracker(tracked);
      setBudget(tracked.budget ?? 0);
      setExpenseCurrency(tracked.currency);
      setIncomeCurrency(tracked.currency);
      setUserTransactions(expensesResponse.expenses.map(mapExpenseToTransaction));
      setMoneyRecords(loansResponse.loans);
      setIncomeRecords(incomeResponse.incomes);
      setRecurringRecords(recurringResponse.recurring);
      setSavingsGoals(goalsResponse.goals);
      setFinanceAccounts(accountsResponse.accounts);
      setCustomCategories(categoriesResponse.categories);
      setAccountTransfers(transfersResponse.transfers);
      setIsDemoAccount(false);
      setIsAuthenticated(true);
      setShowSetup(false);
      setTransactionSearch("");
      setTransactionCategory("All categories");
      setFinanceError("");
      setFinanceMessage("");
      if (user) localStorage.setItem(`hearthy-active-tracker-${user.id}`, tracked.id);
    } finally {
      setLoadingTracker(false);
    }
  }

  const navItems: { label: string; icon: IconName }[] = [
    { label: "Overview", icon: "home" },
    { label: "Transactions", icon: "wallet" },
    { label: "History", icon: "history" },
    { label: "Analytics", icon: "chart" },
    { label: "Goals", icon: "target" },
    { label: "Finance", icon: "arrowUp" },
  ];
  const mobileNavItems = [...navItems, { label: "Settings", icon: "settings" as const }];
  const pageDescriptions: Record<string, string> = {
    Transactions: "Review, search, and manage your expenses.",
    History: "Browse your complete timeline of money activity.",
    Analytics: "Explore your income, spending, and budget trends.",
    Goals: "Set savings targets and track your progress.",
    Finance: "Manage income, recurring payments, and money you owe or are owed.",
    Settings: "Manage your profile, security, accounts, and data.",
  };

  const periodTransactions = userTransactions.filter((transaction) => {
    const parsedDate = parseExpenseDate(transaction.dateISO ?? transaction.date);
    return transaction.currency === tracker.currency && parsedDate ? isWithinPeriod(parsedDate, period) : false;
  });
  const periodIncomeRecords = incomeRecords.filter((income) => {
    const parsedDate = new Date(income.date);
    return income.currency === tracker.currency && !Number.isNaN(parsedDate.getTime()) && isWithinPeriod(parsedDate, period);
  });
  const periodIncome = periodIncomeRecords.reduce((total, income) => total + income.amount, 0);
  const periodTotalSpent = periodTransactions.reduce((total, transaction) => total + transaction.amount, 0);
  const netCashFlow = periodIncome - periodTotalSpent;
  const averageSpend = periodTransactions.length > 0 ? periodTotalSpent / periodTransactions.length : 0;
  const largestCategory = periodTransactions.reduce<Record<string, number>>((totals, transaction) => {
    totals[transaction.category] = (totals[transaction.category] ?? 0) + transaction.amount;
    return totals;
  }, {});
  const topCategory = Object.entries(largestCategory).sort((a, b) => b[1] - a[1])[0];

  const previousPeriodTotal = userTransactions
    .filter((transaction) => transaction.currency === tracker.currency)
    .filter((transaction) => {
      const parsedDate = parseExpenseDate(transaction.dateISO ?? transaction.date);
      if (!parsedDate) return false;

      const previousRange = getPreviousPeriodRange(period);
      return parsedDate >= previousRange.start && parsedDate < previousRange.end;
    })
    .reduce((total, transaction) => total + transaction.amount, 0);
  const periodVariance = previousPeriodTotal === 0 ? 0 : ((periodTotalSpent - previousPeriodTotal) / previousPeriodTotal) * 100;

  const filteredTransactions = userTransactions.filter((transaction) => {
    const query = transactionSearch.trim().toLowerCase();
    const matchesSearch = !query || [transaction.name, transaction.category, transaction.date, transaction.currency, ...(transaction.tags ?? [])]
      .some((value) => value.toLowerCase().includes(query));
    const matchesCategory = transactionCategory === "All categories" || transaction.category === transactionCategory;
    return matchesSearch && matchesCategory;
  });
  const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const today = new Date();
  const historyStartKey = historyDateFilter === "This month"
    ? dateKey(new Date(today.getFullYear(), today.getMonth(), 1))
    : historyDateFilter === "This year"
      ? dateKey(new Date(today.getFullYear(), 0, 1))
      : historyDateFilter === "Custom" ? historyStartDate : "";
  const historyEndKey = historyDateFilter === "Custom" ? historyEndDate : historyDateFilter === "All time" ? "" : dateKey(today);
  const filteredHistoryActivities = historyActivities.filter((activity) => {
    const query = historySearch.trim().toLowerCase();
    const matchesQuery = !query || [activity.title, activity.kind, activity.detail, activity.currency].some((value) => value.toLowerCase().includes(query));
    const parsedDate = activity.date ? new Date(activity.date) : null;
    const activityDateKey = parsedDate && !Number.isNaN(parsedDate.getTime()) ? dateKey(parsedDate) : "";
    const matchesKind = historyKind === "All activity" || activity.kind === historyKind;
    const matchesDate = (!historyStartKey || (activityDateKey && activityDateKey >= historyStartKey)) &&
      (!historyEndKey || (activityDateKey && activityDateKey <= historyEndKey));
    return matchesQuery && matchesKind && matchesDate;
  });
  const historyTotals = filteredHistoryActivities.reduce<Record<string, { income: number; spending: number; incomeCount: number; expenseCount: number }>>((totals, activity) => {
    if (activity.action !== "recorded" || (activity.kind !== "Income" && activity.kind !== "Expense")) return totals;
    const currencyTotals = totals[activity.currency] ?? { income: 0, spending: 0, incomeCount: 0, expenseCount: 0 };
    if (activity.kind === "Income") {
      currencyTotals.income += activity.amount;
      currencyTotals.incomeCount += 1;
    } else {
      currencyTotals.spending += activity.amount;
      currencyTotals.expenseCount += 1;
    }
    totals[activity.currency] = currencyTotals;
    return totals;
  }, {});
  const transactionCategories = [...new Set([
    ...userTransactions.map((transaction) => transaction.category),
    ...customCategories.filter((category) => category.kind === "expense").map((category) => category.name),
  ])].sort();
  const openMoneyRecords = moneyRecords.filter((record) => record.status === "open");
  const moneyTotals = openMoneyRecords.reduce<Record<string, { borrowed: number; lent: number }>>((totals, record) => {
    const currencyTotals = totals[record.currency] ?? { borrowed: 0, lent: 0 };
    currencyTotals[record.direction] += record.amount;
    totals[record.currency] = currencyTotals;
    return totals;
  }, {});
  const overdueMoneyCount = openMoneyRecords.filter((record) => getDueLabel(record.dueDate).startsWith("Overdue")).length;
  const upcomingBills = [...recurringRecords].sort((a, b) => a.nextDue.localeCompare(b.nextDue));
  const upcomingExpenseBills = upcomingBills.filter((record) => record.active && record.kind === "expense").slice(0, 3);
  const recentActivity = [
    ...userTransactions.map((transaction) => {
      const date = parseExpenseDate(transaction.dateISO ?? transaction.date);
      return {
        id: `expense-${transaction.id ?? `${transaction.name}-${transaction.date}`}`,
        title: transaction.name,
        detail: `${transaction.category} · ${date ? date.toLocaleDateString(undefined, { month: "short", day: "numeric" }) : transaction.date}`,
        amount: transaction.amount,
        currency: transaction.currency,
        timestamp: date?.getTime() ?? 0,
        direction: "out" as const,
        transaction,
      };
    }),
    ...incomeRecords.map((income) => {
      const date = new Date(income.date);
      const validDate = !Number.isNaN(date.getTime());
      return {
        id: `income-${income.id}`,
        title: income.name,
        detail: `${income.category} · ${validDate ? date.toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "Date unavailable"}`,
        amount: income.amount,
        currency: income.currency,
        timestamp: validDate ? date.getTime() : 0,
        direction: "in" as const,
        transaction: null,
      };
    }),
  ].sort((first, second) => second.timestamp - first.timestamp).slice(0, 4);
  const overviewGoalPreviews = savingsGoals.slice(0, 3);
  const dueBillsCount = upcomingBills.filter((record) => record.active && new Date(`${record.nextDue}T12:00:00`) <= new Date(Date.now() + 7 * 86_400_000)).length;

  const totalSpent = userTransactions.filter((transaction) => transaction.currency === tracker.currency).reduce((total, transaction) => total + transaction.amount, 0);
  const budgetMonthSpent = userTransactions.filter((transaction) => {
    const date = parseExpenseDate(transaction.dateISO ?? transaction.date);
    return transaction.currency === tracker.currency && date ? isWithinPeriod(date, "This month") : false;
  }).reduce((total, transaction) => total + transaction.amount, 0);
  const accountActivity = financeAccounts.map((account) => {
    const spent = userTransactions.filter((transaction) => transaction.accountId === account.id && transaction.currency === account.currency).reduce((total, transaction) => total + transaction.amount, 0);
    const earned = incomeRecords.filter((income) => income.accountId === account.id && income.currency === account.currency).reduce((total, income) => total + income.amount, 0);
    return { ...account, spent, earned, currentBalance: (Number(account.openingBalance) || 0) + earned - spent };
  });
  const accountBalancesByCurrency = accountActivity.reduce<Record<string, number>>((totals, account) => {
    totals[account.currency] = (totals[account.currency] ?? 0) + account.currentBalance;
    return totals;
  }, {});
  const currentMonth = new Date();
  currentMonth.setDate(1);
  currentMonth.setHours(0, 0, 0, 0);
  const startDateValue = tracker.createdAt ?? user?.createdAt;
  const startDate = startDateValue ? new Date(startDateValue) : currentMonth;
  const trackingStartMonth = Number.isNaN(startDate.getTime())
    ? currentMonth
    : new Date(startDate.getFullYear(), startDate.getMonth(), 1);
  const firstChartMonth = new Date(currentMonth);
  firstChartMonth.setMonth(currentMonth.getMonth() - 5);
  if (trackingStartMonth > firstChartMonth) {
    firstChartMonth.setTime(Math.min(trackingStartMonth.getTime(), currentMonth.getTime()));
  }
  const chartMonthCount =
    (currentMonth.getFullYear() - firstChartMonth.getFullYear()) * 12 +
    currentMonth.getMonth() -
    firstChartMonth.getMonth() +
    1;
  const chartMonths = Array.from({ length: chartMonthCount }, (_, index) => {
    const date = new Date(firstChartMonth);
    date.setMonth(firstChartMonth.getMonth() + index);
    return date;
  });
  const chartData = chartMonths.map((month) => {
    const inMonth = (dateValue: string) => {
      const date = new Date(dateValue);
      return !Number.isNaN(date.getTime()) && date.getFullYear() === month.getFullYear() && date.getMonth() === month.getMonth();
    };
    return {
      income: incomeRecords.filter((item) => item.currency === tracker.currency && inMonth(item.date)).reduce((sum, item) => sum + item.amount, 0),
      spending: userTransactions.filter((item) => item.currency === tracker.currency && inMonth(item.dateISO ?? item.date)).reduce((sum, item) => sum + item.amount, 0),
    };
  });
  const chartScale = Math.max(1, ...chartData.flatMap((item) => [item.income, item.spending])) * 1.1;
  const chartX = (index: number) => chartData.length === 1 ? 310 : Math.round(index * (620 / (chartData.length - 1)));
  const buildChartPath = (key: "income" | "spending") => {
    const points = chartData.map((item, index) => ({
      x: chartX(index),
      y: Math.round(178 - (item[key] / chartScale) * 160),
    }));
    if (points.length === 1) return `M292 ${points[0].y} L328 ${points[0].y}`;

    return points.reduce((path, point, index) => {
      if (index === 0) return `M${point.x} ${point.y}`;
      const previous = points[index - 1];
      const beforePrevious = points[index - 2] ?? previous;
      const next = points[index + 1] ?? point;
      const control1X = previous.x + (point.x - beforePrevious.x) / 6;
      const control1Y = previous.y + (point.y - beforePrevious.y) / 6;
      const control2X = point.x - (next.x - previous.x) / 6;
      const control2Y = point.y - (next.y - previous.y) / 6;
      return `${path} C${control1X} ${control1Y}, ${control2X} ${control2Y}, ${point.x} ${point.y}`;
    }, "");
  };
  const incomeChartPath = buildChartPath("income");
  const spendingChartPath = buildChartPath("spending");
  const chartAreaPath = `${incomeChartPath} L620 178 L0 178Z`;
  const chartTotalIncome = chartData.reduce((total, item) => total + item.income, 0);
  const chartTotalSpend = chartData.reduce((total, item) => total + item.spending, 0);
  const chartPeriodLabel = chartMonths.length < 6
    ? `since ${chartMonths[0].toLocaleDateString(undefined, { month: "long", year: "numeric" })}`
    : "across the last 6 months";
  const availableBalance = Math.max(budget - budgetMonthSpent, 0);
  const budgetUsed = budget > 0 ? (budgetMonthSpent / budget) * 100 : 0;
  const budgetAlertLevel = budget > 0 && budgetUsed >= 100 ? "exceeded" : budget > 0 && budgetUsed >= 80 ? "near" : "";
  const monthlyCategoryTotals = isDemoAccount
    ? categories.filter((category) => category.value > 0)
    : Object.entries(userTransactions.reduce<Record<string, number>>((totals, transaction) => {
      const date = parseExpenseDate(transaction.dateISO ?? transaction.date);
      if (transaction.currency === tracker.currency && date && isWithinPeriod(date, "This month")) {
        totals[transaction.category] = (totals[transaction.category] ?? 0) + transaction.amount;
      }
      return totals;
    }, {}))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([name, value], index) => ({
        name,
        value,
        percent: budget > 0 ? Math.min((value / budget) * 100, 100) : 0,
        color: categories[index % categories.length].color,
      }));
  const hasCashFlowData = chartTotalIncome > 0 || chartTotalSpend > 0;

  function openBudget() {
    setBudgetMode("increase");
    setBudgetInput("");
    setBudgetError("");
    setModalMode("budget");
    setShowModal(true);
  }

  function openSetBudget() {
    setBudgetMode("set-total");
    setBudgetInput(budget > 0 ? String(budget) : "");
    setBudgetError("");
    setModalMode("budget");
    setShowModal(true);
  }

  function openExpense() {
    if (budget === 0) {
      openBudget();
      return;
    }
    setExpenseCurrency(tracker.currency);
    setExpenseDate(new Date().toISOString().slice(0, 10));
    setExpenseAccount("");
    setExpenseTagsInput("");
    setExpenseReceipt("");
    setEditingExpenseId(null);
    setExpenseError("");
    setFinanceError("");
    setModalMode("expense");
    setShowModal(true);
  }

  function openIncome() {
    setEditingIncomeId("");
    setIncomeName("");
    setIncomeAmount("");
    setIncomeDate(new Date().toISOString().slice(0, 10));
    setIncomeCurrency(tracker.currency);
    setIncomeAccount("");
    setFinanceError("");
    setModalMode("income");
    setShowModal(true);
  }

  function openGoal() {
    setGoalName("");
    setGoalTarget("");
    setGoalDate("");
    setFinanceError("");
    setModalMode("goal");
    setShowModal(true);
  }

  function openTransactionDetails(transaction: ExpenseTransaction) {
    setSelectedTransaction(transaction);
    setModalMode("transaction-detail");
    setShowModal(true);
  }

  function showUndoNotice(message: string, restore: () => Promise<void>) {
    if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
    setUndoNotice({ message, restore });
    undoTimeoutRef.current = setTimeout(() => setUndoNotice(null), 8000);
  }

  async function undoLastAction() {
    if (!undoNotice) return;
    const { restore } = undoNotice;
    if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
    setUndoNotice(null);
    try {
      await restore();
      setFinanceMessage("The deleted record was restored.");
      setFinanceError("");
    } catch (error) {
      setFinanceError(error instanceof Error ? error.message : "Unable to restore the deleted record.");
    }
  }

  function openCsvImport() {
    setCsvPreviewRows([]);
    setCsvIgnoredRows(0);
    setCsvImportError("");
    setModalMode("import");
    setShowModal(true);
  }

  async function previewCsvFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setCsvPreviewRows([]);
    setCsvIgnoredRows(0);
    setCsvImportError("");

    try {
      if (file.size > 5 * 1024 * 1024) throw new Error("Choose a CSV file smaller than 5 MB.");
      const preview = previewExpenseCsv(await file.text(), tracker.currency, financeAccounts, userTransactions);
      if (preview.rows.length > 500) throw new Error("Import up to 500 expense rows at a time.");
      setCsvPreviewRows(preview.rows);
      setCsvIgnoredRows(preview.ignoredRows);
      if (preview.rows.length === 0) setCsvImportError("No expense rows were found in this CSV.");
    } catch (error) {
      setCsvImportError(error instanceof Error ? error.message : "Unable to read this CSV file.");
    }
  }

  async function importCsvExpenses() {
    if (!tracker.id) {
      setCsvImportError("Your tracker is still loading. Please try again.");
      return;
    }
    const expenses = csvPreviewRows.filter((row) => row.selected && row.expense).map((row) => row.expense!);
    if (expenses.length === 0) {
      setCsvImportError("Select at least one valid expense to import.");
      return;
    }

    setSavingCsvImport(true);
    setCsvImportError("");
    try {
      const response = await apiFetch<{ expenses: any[] }>(`/trackers/${tracker.id}/expenses/import`, {
        method: "POST",
        body: JSON.stringify({ expenses }),
      });
      const imported = response.expenses.map(mapExpenseToTransaction);
      setUserTransactions((current) => [...imported, ...current].sort((first, second) =>
        new Date(second.dateISO ?? second.date).getTime() - new Date(first.dateISO ?? first.date).getTime(),
      ));
      const skipped = csvPreviewRows.filter((row) => !row.selected).length + csvIgnoredRows;
      setShowModal(false);
      setFinanceMessage(`Imported ${imported.length} expense${imported.length === 1 ? "" : "s"}${skipped ? `; skipped ${skipped} row${skipped === 1 ? "" : "s"}` : ""}.`);
    } catch (error) {
      setCsvImportError(error instanceof Error ? error.message : "Unable to import these expenses.");
    } finally {
      setSavingCsvImport(false);
    }
  }

  function openMoneyRecord(record?: MoneyRecord) {
    setMoneyRecordId(record?.id ?? null);
    setMoneyDirection(record?.direction ?? "borrowed");
    setMoneyPerson(record?.person ?? "");
    setMoneyAmount(record ? String(record.amount) : "");
    setMoneyCurrency(record?.currency ?? tracker.currency);
    setMoneyDueDate(record?.dueDate ?? new Date().toISOString().slice(0, 10));
    setMoneyNote(record?.note ?? "");
    setMoneyError("");
    setModalMode("loan");
    setShowModal(true);
  }

  function handleNavClick(label: string) {
    setActiveNav(label);
  }

  function showCategoryTransactions(category?: string) {
    setTransactionSearch("");
    setTransactionCategory(category ?? "All categories");
    handleNavClick("Transactions");
  }

  function exportTransactions() {
    if (filteredTransactions.length === 0 && incomeRecords.length === 0) return;

    const protectSpreadsheetCell = (value: string | number) => {
      const text = String(value);
      const safeText = /^[\t\r ]*[=+\-@]/.test(text) ? `'${text}` : text;
      return `"${safeText.replace(/"/g, '""')}"`;
    };
    const rows = [
      ["Type", "Name", "Category", "Date", "Amount", "Currency", "Account", "Tags"],
      ...filteredTransactions.map((transaction) => [
        "Expense",
        transaction.name,
        transaction.category,
        transaction.dateISO ?? transaction.date,
        transaction.amount,
        transaction.currency,
        financeAccounts.find((account) => account.id === transaction.accountId)?.name ?? "",
        (transaction.tags ?? []).join("; "),
      ]),
      ...incomeRecords.map((income) => [
        "Income",
        income.name,
        income.category,
        income.date,
        income.amount,
        income.currency,
        financeAccounts.find((account) => account.id === income.accountId)?.name ?? "",
        "",
      ]),
    ];
    const csv = rows.map((row) => row.map(protectSpreadsheetCell).join(",")).join("\r\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `hearthy-transactions-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function openEditExpense(transaction: ExpenseTransaction) {
    setExpenseName(transaction.name);
    setExpenseAmount(String(transaction.amount));
    setExpenseCategory(transaction.category);
    setExpenseCurrency(transaction.currency);
    setExpenseAccount(transaction.accountId ?? "");
    setExpenseTagsInput((transaction.tags ?? []).join(", "));
    setExpenseReceipt(transaction.receipt ?? "");
    setExpenseDate((transaction.dateISO ?? parseExpenseDate(transaction.date)?.toISOString() ?? new Date().toISOString()).slice(0, 10));
    setEditingExpenseId(transaction.id ?? null);
    setExpenseError("");
    setModalMode("expense");
    setShowModal(true);
  }

  async function handleProfilePictureUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !user) return;

    if (file.size > 3 * 1024 * 1024) {
      setProfileError("Choose an image under 3 MB for the best profile experience.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      setProfileForm((current) => ({ ...current, avatar: result }));
      setProfileMessage("Profile photo updated in the form. Save to confirm.");
    };
    reader.onerror = () => {
      setProfileError("This image could not be read. Please try another file.");
    };
    reader.readAsDataURL(file);
  }

  async function saveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;
    setSavingProfile(true);
    setProfileError("");
    setProfileMessage("");

    try {
      const response = await apiFetch<{ user: User }>(`/users/${user.id}/profile`, {
        method: "PUT",
        body: JSON.stringify({
          name: user.name,
          username: profileForm.username,
          bio: profileForm.bio,
          avatar: profileForm.avatar,
          notificationPreferences: {
            emailReminders: profileForm.emailReminders,
            browserReminders: profileForm.browserReminders,
            weeklyDigest: profileForm.weeklyDigest,
          },
        }),
      });
      setUser(response.user);
      setBrowserRemindersEnabled(profileForm.browserReminders);
      localStorage.setItem("hearthy-browser-reminders", profileForm.browserReminders ? "enabled" : "disabled");
      setProfileMessage("Profile saved.");
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : "Unable to save your profile.");
    } finally {
      setSavingProfile(false);
    }
  }

  async function updatePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;

    if (!currentPassword || !newPassword || !confirmPassword) {
      setProfileError("Fill in your current password, new password, and confirmation.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setProfileError("The new passwords do not match.");
      return;
    }

    setSavingPassword(true);
    setProfileError("");
    setProfileMessage("");

    try {
      await apiFetch<{ message: string }>(`/users/${user.id}/password`, {
        method: "PUT",
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setProfileMessage("Password updated successfully.");
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : "Unable to update your password.");
    } finally {
      setSavingPassword(false);
    }
  }

  async function startMembershipCheckout(months: number) {
    if (!user) return;
    setLoadingAuth(true);
    setAuthError("");
    try {
      const billingConfig = await apiFetch<{ demoPaymentsEnabled: boolean }>("/billing/config", { cache: "no-store" });
      setDemoPaymentsEnabled(billingConfig.demoPaymentsEnabled);
      if (billingConfig.demoPaymentsEnabled) {
        await applyDemoMembership(months);
        return;
      }

      const response = await apiFetch<{ checkoutUrl: string }>("/billing/checkout-session", {
        method: "POST",
        body: JSON.stringify({ months }),
      });
      window.location.assign(response.checkoutUrl);
    } catch (error) {
      const statusCode = error instanceof Error ? (error as Error & { statusCode?: number }).statusCode : undefined;
      if (statusCode === 409) {
        setDemoPaymentsEnabled(true);
        try {
          await applyDemoMembership(months);
          return;
        } catch (demoError) {
          setAuthError(demoError instanceof Error ? demoError.message : "Unable to activate the demo plan.");
          return;
        }
      }
      setAuthError(error instanceof Error ? error.message : "Unable to start secure checkout.");
    } finally {
      setLoadingAuth(false);
    }
  }

  async function applyDemoMembership(months: number) {
    const membership = await apiFetch<{ membershipExpiresAt: string; membershipPlanMonths: number; demoPayment: boolean }>("/billing/demo/complete", {
      method: "POST",
      body: JSON.stringify({ months }),
    });
    if (!membership.demoPayment) throw new Error("The server did not confirm demo access.");
    setUser((current) => current ? {
      ...current,
      membershipExpiresAt: membership.membershipExpiresAt,
      membershipPlanMonths: membership.membershipPlanMonths,
    } : current);
    setMembershipExpired(false);
    setAuthError("");
  }

  async function completeDemoMembershipPayment(months: number) {
    if (!user) return;
    setLoadingAuth(true);
    setAuthError("");
    try {
      await applyDemoMembership(months);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Unable to complete the demo payment.");
    } finally {
      setLoadingAuth(false);
    }
  }

  async function handleAuthSubmit(payload: { name?: string; email: string; username?: string; password: string }) {
    setLoadingAuth(true);
    setAuthError("");

    try {
      if (authMode === "admin") {
        const result = await apiFetch<{ token: string }>("/admin/login", {
          method: "POST",
          body: JSON.stringify({ username: payload.username, password: payload.password }),
        });
        setAdminToken(result.token);
        sessionStorage.removeItem(USER_SESSION_KEY);
        setUser(null);
        setIsAuthenticated(false);
      } else if (authMode === "signup") {
        const result = await apiFetch<{ user: User; token: string }>('/auth/signup', {
          method: 'POST',
          body: JSON.stringify({
            name: payload.name,
            email: payload.email,
            password: payload.password,
          }),
        });
        sessionStorage.setItem(USER_SESSION_KEY, result.token);
        setUser(result.user);
        setIsAuthenticated(true);
        setMembershipExpired(true);
        setShowSetup(false);
      } else if (authMode === "reset") {
        const resetToken = new URLSearchParams(window.location.search).get("reset");
        if (resetToken) {
          await apiFetch<{ message: string }>("/auth/password-reset/complete", {
            method: "POST",
            body: JSON.stringify({ token: resetToken, password: payload.password }),
          });
          window.history.replaceState({}, "", window.location.pathname);
          setAuthMode("login");
          setAuthError("Your password was updated. Sign in with the new password.");
        } else {
          const result = await apiFetch<{ message: string }>("/auth/password-reset/request", {
            method: "POST",
            body: JSON.stringify({ email: payload.email }),
          });
          setAuthError(result.message);
        }
      } else {
        const result = await apiFetch<{ user: User; token: string }>('/auth/login', {
          method: 'POST',
          body: JSON.stringify({
            email: payload.email,
            password: payload.password,
          }),
        });
        sessionStorage.setItem(USER_SESSION_KEY, result.token);
        setLoadingAccount(true);
        setUser(result.user);
        setIsAuthenticated(true);
        setShowSetup(false);
      }
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Failed to sign in.');
    } finally {
      setLoadingAuth(false);
    }
  }

  async function logoutUser() {
    try {
      await apiFetch<void>("/auth/logout", { method: "POST" });
    } catch (error) {
      console.error("Unable to end the server session cleanly.", error);
    } finally {
      sessionStorage.removeItem(USER_SESSION_KEY);
      setUser(null);
      setTrackers([]);
      setIsAuthenticated(false);
      setMembershipExpired(false);
      setShowSetup(false);
      setLoadingAccount(false);
    }
  }

  async function handleSetupComplete(config: TrackerConfig) {
    if (!user) return;

    try {
      const result = await apiFetch<{ tracker: TrackerConfig }>('/trackers', {
        method: 'POST',
        body: JSON.stringify({
          userId: user.id,
          name: config.name,
          currency: config.currency,
          context: config.context,
          destination: config.destination,
        }),
      });

      const nextTracker = result.tracker;
      setTrackers((current) => [nextTracker, ...current.filter((item) => item.id !== nextTracker.id)]);
      setTracker(nextTracker);
      setBudget(nextTracker.budget ?? 0);
      setUserTransactions([]);
      setMoneyRecords([]);
      setIncomeRecords([]);
      setRecurringRecords([]);
      setSavingsGoals([]);
      setFinanceAccounts([]);
      setCustomCategories([]);
      setAccountTransfers([]);
      setExpenseCurrency(nextTracker.currency);
      if (nextTracker.id) localStorage.setItem(`hearthy-active-tracker-${user.id}`, nextTracker.id);
      setIsDemoAccount(false);
      setShowSetup(false);
      setIsAuthenticated(true);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Unable to create tracker.');
    }
  }

  function openCreateTracker() {
    setNewTrackerName("");
    setNewTrackerContext("Everyday");
    setNewTrackerCurrency(tracker.currency);
    setNewTrackerDestination("");
    setNewTrackerBudget("");
    setTrackerFormError("");
    setModalMode("tracker");
    setShowModal(true);
  }

  async function switchTracker(trackerId: string) {
    const nextTracker = trackers.find((item) => item.id === trackerId);
    if (!nextTracker || nextTracker.id === tracker.id) return;
    try {
      await loadTrackerData(nextTracker);
    } catch (error) {
      setFinanceError(error instanceof Error ? error.message : "Unable to switch trackers.");
    }
  }

  async function createTracker(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) {
      setTrackerFormError("Sign in before creating a tracker.");
      return;
    }
    const startingBudget = newTrackerBudget.trim() ? Number(newTrackerBudget) : 0;
    if (!Number.isFinite(startingBudget) || startingBudget < 0) {
      setTrackerFormError("Enter a valid budget amount, or leave it empty to set a budget later.");
      return;
    }
    setCreatingTracker(true);
    setTrackerFormError("");
    let createdTracker: TrackerConfig;
    try {
      const response = await apiFetch<{ tracker: TrackerConfig }>("/trackers", {
        method: "POST",
        body: JSON.stringify({
          userId: user.id,
          name: newTrackerName.trim(),
          currency: newTrackerCurrency,
          context: newTrackerContext,
          destination: newTrackerDestination.trim(),
          budget: startingBudget,
        }),
      });
      createdTracker = response.tracker;
    } catch (error) {
      setTrackerFormError(error instanceof Error ? error.message : "Unable to create this tracker.");
      setCreatingTracker(false);
      return;
    }

    setTrackers((current) => [createdTracker, ...current.filter((item) => item.id !== createdTracker.id)]);
    setShowModal(false);
    try {
      await loadTrackerData(createdTracker);
      setFinanceMessage(`"${createdTracker.name}" tracker created. Set its budget to start tracking.`);
    } catch (error) {
      setFinanceError(error instanceof Error ? `Tracker created, but unable to load it: ${error.message}` : "Tracker created, but unable to load it.");
    } finally {
      setCreatingTracker(false);
    }
  }

  async function saveBudget(nextBudget: number) {
    if (!tracker.id) {
      throw new Error("Your tracker is still loading. Please try again.");
    }
    await apiFetch<{ tracker: TrackerConfig }>(`/trackers/${tracker.id}/budget`, {
      method: 'PUT',
      body: JSON.stringify({ budget: nextBudget, currency: tracker.currency }),
    });
    setBudget(nextBudget);
    setTracker((current) => ({ ...current, budget: nextBudget }));
    setTrackers((current) => current.map((item) => item.id === tracker.id ? { ...item, budget: nextBudget } : item));
  }

  async function handleBudgetSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const enteredAmount = Number(budgetInput);
    if (!Number.isFinite(enteredAmount) || enteredAmount <= 0) {
      setBudgetError("Enter an amount greater than zero.");
      return;
    }

    const nextBudget = budgetMode === "increase" ? budget + enteredAmount : enteredAmount;
    setSavingBudget(true);
    setBudgetError("");
    try {
      await saveBudget(nextBudget);
      setShowModal(false);
    } catch (error) {
      setBudgetError(error instanceof Error ? error.message : "Unable to update the budget.");
    } finally {
      setSavingBudget(false);
    }
  }

  async function saveExpense() {
    if (!tracker.id) {
      setExpenseError("Select a saved tracker before recording expenses.");
      return;
    }

    setSavingExpense(true);
    setExpenseError("");
    const newExpense = {
      name: expenseName,
      amount: Number(expenseAmount),
      category: expenseCategory,
      currency: expenseCurrency,
      date: new Date(`${expenseDate}T12:00:00`).toISOString(),
      icon: { Groceries: "cart", "Dining out": "coffee", Transport: "car", "Bills & utilities": "homeSmall", Lifestyle: "wallet" }[expenseCategory] ?? "wallet",
      tone: "sage",
      accountId: expenseAccount,
      tags: [...new Set(expenseTagsInput.split(",").map((tag) => tag.trim()).filter(Boolean))].slice(0, 20),
      receipt: expenseReceipt,
    };

    try {
      const response = await apiFetch<{ expense: any }>(
        `/trackers/${tracker.id}/expenses${editingExpenseId ? `/${editingExpenseId}` : ""}`,
        {
          method: editingExpenseId ? "PUT" : "POST",
          body: JSON.stringify(newExpense),
        },
      );

      const savedTransaction = mapExpenseToTransaction(response.expense);
      setUserTransactions((current) => editingExpenseId
        ? current.map((transaction) => transaction.id === editingExpenseId ? savedTransaction : transaction)
        : [savedTransaction, ...current]);
      setExpenseName("");
      setExpenseAmount("");
      setEditingExpenseId(null);
      setShowModal(false);
      setFinanceMessage(editingExpenseId ? "Expense updated." : "Expense recorded.");
      setFinanceError("");
    } catch (error) {
      setExpenseError(error instanceof Error ? error.message : "Unable to save this expense.");
    } finally {
      setSavingExpense(false);
    }
  }

  async function deleteExpense(transaction: ExpenseTransaction) {
    if (!tracker.id || !transaction.id) return;
    if (!window.confirm(`Delete "${transaction.name}"? You can restore it for a few seconds after deletion.`)) return;

    try {
      const deleted = await apiFetch<{ expense: ExpenseTransaction; deletionActivityId: string }>(`/trackers/${tracker.id}/expenses/${transaction.id}`, { method: "DELETE" });
      setUserTransactions((current) => current.filter((item) => item.id !== transaction.id));
      showUndoNotice(`Deleted "${transaction.name}".`, async () => {
        const restored = await apiFetch<{ expense: any }>(`/trackers/${tracker.id}/expenses/${transaction.id}/restore`, {
          method: "POST",
          body: JSON.stringify({ expense: deleted.expense, deletionActivityId: deleted.deletionActivityId }),
        });
        const restoredTransaction = mapExpenseToTransaction(restored.expense);
        setUserTransactions((current) => [...current.filter((item) => item.id !== transaction.id), restoredTransaction]);
      });
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Unable to delete this expense.");
    }
  }

  async function saveIncome(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!tracker.id) {
      setFinanceError("Select a saved tracker before recording income.");
      return;
    }
    setSavingFinance(true);
    setFinanceError("");
    const wasEditing = Boolean(editingIncomeId);
    try {
      const response = await apiFetch<{ income: IncomeRecord }>(`/trackers/${tracker.id}/incomes${editingIncomeId ? `/${editingIncomeId}` : ""}`, {
        method: editingIncomeId ? "PUT" : "POST",
        body: JSON.stringify({
          name: incomeName,
          amount: Number(incomeAmount),
          currency: incomeCurrency,
          category: incomeCategory,
          date: new Date(`${incomeDate}T12:00:00`).toISOString(),
          accountId: incomeAccount,
        }),
      });
      setIncomeRecords((current) => editingIncomeId
        ? current.map((income) => income.id === editingIncomeId ? response.income : income)
        : [response.income, ...current]);
      setIncomeName("");
      setIncomeAmount("");
      setEditingIncomeId("");
      setFinanceMessage(wasEditing ? "Income updated." : "Income recorded.");
      setFinanceError("");
      if (showModal && modalMode === "income") setShowModal(false);
    } catch (error) {
      setFinanceError(error instanceof Error ? error.message : "Unable to record income.");
    } finally {
      setSavingFinance(false);
    }
  }

  async function saveRecurring(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!tracker.id) {
      setFinanceError("Select a saved tracker before managing recurring payments.");
      return;
    }
    setSavingFinance(true);
    setFinanceError("");
    try {
      const response = await apiFetch<{ recurring: RecurringRecord }>(`/trackers/${tracker.id}/recurring${editingRecurringId ? `/${editingRecurringId}` : ""}`, {
        method: editingRecurringId ? "PUT" : "POST",
        body: JSON.stringify({
          name: recurringName,
          amount: Number(recurringAmount),
          currency: recurringCurrency,
          category: recurringKind === "income" ? "Salary" : "Bills & utilities",
          kind: recurringKind,
          frequency: recurringFrequency,
          nextDue: recurringDue,
          accountId: recurringAccount,
          active: editingRecurringId ? recurringRecords.find((record) => record.id === editingRecurringId)?.active ?? true : true,
        }),
      });
      setRecurringRecords((current) => (editingRecurringId
        ? current.map((record) => record.id === editingRecurringId ? response.recurring : record)
        : [...current, response.recurring]).sort((a, b) => a.nextDue.localeCompare(b.nextDue)));
      const wasEditing = Boolean(editingRecurringId);
      setEditingRecurringId("");
      setRecurringName("");
      setRecurringAmount("");
      setFinanceMessage(wasEditing ? "Recurring payment updated." : "Recurring payment added.");
    } catch (error) {
      setFinanceError(error instanceof Error ? error.message : "Unable to add recurring payment.");
    } finally {
      setSavingFinance(false);
    }
  }

  function openIncomeForEdit(income: IncomeRecord) {
    setEditingIncomeId(income.id);
    setIncomeName(income.name);
    setIncomeAmount(String(income.amount));
    setIncomeDate(income.date.slice(0, 10));
    setIncomeCurrency(income.currency);
    setIncomeCategory(income.category);
    setIncomeAccount(income.accountId);
    setFinanceError("");
    setModalMode("income");
    setShowModal(true);
  }

  function openRecurringForEdit(record: RecurringRecord) {
    setEditingRecurringId(record.id);
    setRecurringName(record.name);
    setRecurringAmount(String(record.amount));
    setRecurringCurrency(record.currency);
    setRecurringDue(record.nextDue);
    setRecurringFrequency(record.frequency);
    setRecurringKind(record.kind);
    setRecurringAccount(record.accountId);
    setFinanceError("");
    const form = document.getElementById("recurring-payment-form");
    if (form instanceof HTMLDetailsElement) form.open = true;
  }

  function cancelRecurringEdit() {
    setEditingRecurringId("");
    setRecurringName("");
    setRecurringAmount("");
    setRecurringCurrency(tracker.currency);
    setRecurringDue(new Date().toISOString().slice(0, 10));
    setRecurringFrequency("monthly");
    setRecurringKind("expense");
    setRecurringAccount("");
    setFinanceError("");
  }

  async function recordRecurringPayment(record: RecurringRecord) {
    if (!tracker.id) return;
    setFinanceError("");
    try {
      const response = await apiFetch<{ expense?: any; income?: IncomeRecord; recurring: RecurringRecord }>(`/trackers/${tracker.id}/recurring/${record.id}/pay`, { method: "POST" });
      if (response.expense) setUserTransactions((current) => [mapExpenseToTransaction(response.expense), ...current]);
      if (response.income) setIncomeRecords((current) => [response.income!, ...current]);
      setRecurringRecords((current) => current.map((item) => item.id === record.id ? response.recurring : item));
      setFinanceMessage(`${record.name} recorded as ${record.kind}. Next due date updated.`);
    } catch (error) {
      setFinanceError(error instanceof Error ? error.message : "Unable to record this payment.");
    }
  }

  async function toggleRecurring(record: RecurringRecord) {
    if (!tracker.id) return;
    try {
      const response = await apiFetch<{ recurring: RecurringRecord }>(`/trackers/${tracker.id}/recurring/${record.id}`, {
        method: "PUT",
        body: JSON.stringify({ ...record, active: !record.active }),
      });
      setRecurringRecords((current) => current.map((item) => item.id === record.id ? response.recurring : item));
    } catch (error) {
      setFinanceError(error instanceof Error ? error.message : "Unable to update recurring payment.");
    }
  }

  async function deleteRecurring(record: RecurringRecord) {
    if (!tracker.id || !window.confirm(`Delete recurring payment "${record.name}"? You can restore it for a few seconds after deletion.`)) return;
    try {
      const deleted = await apiFetch<{ recurring: RecurringRecord; deletionActivityId: string }>(`/trackers/${tracker.id}/recurring/${record.id}`, { method: "DELETE" });
      setRecurringRecords((current) => current.filter((item) => item.id !== record.id));
      showUndoNotice(`Deleted recurring payment "${record.name}".`, async () => {
        const restored = await apiFetch<{ recurring: RecurringRecord }>(`/trackers/${tracker.id}/recurring/${record.id}/restore`, {
          method: "POST",
          body: JSON.stringify({ record: deleted.recurring, deletionActivityId: deleted.deletionActivityId }),
        });
        setRecurringRecords((current) => [...current.filter((item) => item.id !== record.id), restored.recurring]
          .sort((a, b) => a.nextDue.localeCompare(b.nextDue)));
      });
    } catch (error) {
      setFinanceError(error instanceof Error ? error.message : "Unable to delete recurring payment.");
    }
  }

  async function deleteIncome(income: IncomeRecord) {
    if (!tracker.id || !window.confirm(`Delete income "${income.name}"? You can restore it for a few seconds after deletion.`)) return;
    try {
      const deleted = await apiFetch<{ income: IncomeRecord; deletionActivityId: string }>(`/trackers/${tracker.id}/incomes/${income.id}`, { method: "DELETE" });
      setIncomeRecords((current) => current.filter((item) => item.id !== income.id));
      showUndoNotice(`Deleted income "${income.name}".`, async () => {
        const restored = await apiFetch<{ income: IncomeRecord }>(`/trackers/${tracker.id}/incomes/${income.id}/restore`, {
          method: "POST",
          body: JSON.stringify({ record: deleted.income, deletionActivityId: deleted.deletionActivityId }),
        });
        setIncomeRecords((current) => [...current.filter((item) => item.id !== income.id), restored.income]);
      });
    } catch (error) {
      setFinanceError(error instanceof Error ? error.message : "Unable to delete income.");
    }
  }

  async function deleteGoal(goal: SavingsGoal) {
    if (!tracker.id || !window.confirm(`Delete savings goal "${goal.name}"?`)) return;
    try {
      await apiFetch<void>(`/trackers/${tracker.id}/goals/${goal.id}`, { method: "DELETE" });
      setSavingsGoals((current) => current.filter((item) => item.id !== goal.id));
    } catch (error) {
      setFinanceError(error instanceof Error ? error.message : "Unable to delete savings goal.");
    }
  }

  async function saveGoal(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!tracker.id) {
      setFinanceError("Select a saved tracker before creating a savings goal.");
      return;
    }
    setSavingFinance(true);
    setFinanceError("");
    try {
      const response = await apiFetch<{ goal: SavingsGoal }>(`/trackers/${tracker.id}/goals`, {
        method: "POST",
        body: JSON.stringify({ name: goalName, targetAmount: Number(goalTarget), currentAmount: 0, currency: tracker.currency, targetDate: goalDate }),
      });
      setSavingsGoals((current) => [...current, response.goal]);
      setGoalName("");
      setGoalTarget("");
      setGoalDate("");
      setFinanceMessage("Savings goal created.");
      setFinanceError("");
      if (showModal && modalMode === "goal") setShowModal(false);
    } catch (error) {
      setFinanceError(error instanceof Error ? error.message : "Unable to create savings goal.");
    } finally {
      setSavingFinance(false);
    }
  }

  async function contributeToGoal(event: React.FormEvent<HTMLFormElement>, goal: SavingsGoal) {
    event.preventDefault();
    if (!tracker.id) return;
    setFinanceError("");
    try {
      const response = await apiFetch<{ goal: SavingsGoal; contribution: GoalContribution }>(`/trackers/${tracker.id}/goals/${goal.id}/contributions`, {
        method: "POST",
        body: JSON.stringify({ amount: Number(goalContribution) }),
      });
      setSavingsGoals((current) => current.map((item) => item.id === goal.id ? response.goal : item));
      setGoalContribution("");
      setContributingGoalId("");
      setFinanceMessage(`Added ${formatMoney(response.contribution.amount, goal.currency)} to ${goal.name}; contribution added to history.`);
    } catch (error) {
      setFinanceError(error instanceof Error ? error.message : "Unable to save goal contribution.");
    }
  }

  async function saveCustomCategory(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!tracker.id) return;
    setFinanceError("");
    try {
      const response = await apiFetch<{ category: CustomCategory }>(`/trackers/${tracker.id}/categories`, {
        method: "POST",
        body: JSON.stringify({ name: newCategoryName, kind: newCategoryKind }),
      });
      setCustomCategories((current) => [...current, response.category]);
      setNewCategoryName("");
      setFinanceMessage("Category added.");
    } catch (error) {
      setFinanceError(error instanceof Error ? error.message : "Unable to add category.");
    }
  }

  async function deleteCustomCategory(category: CustomCategory) {
    if (!tracker.id || !window.confirm(`Remove category "${category.name}"? Existing expenses will keep their category.`)) return;
    try {
      await apiFetch<void>(`/trackers/${tracker.id}/categories/${category.id}`, { method: "DELETE" });
      setCustomCategories((current) => current.filter((item) => item.id !== category.id));
    } catch (error) {
      setFinanceError(error instanceof Error ? error.message : "Unable to remove category.");
    }
  }

  async function saveAccount(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!tracker.id) return;
    setFinanceError("");
    try {
      const response = await apiFetch<{ account: FinanceAccount }>(`/trackers/${tracker.id}/accounts`, {
        method: "POST",
        body: JSON.stringify({ name: newAccountName, type: newAccountType, currency: tracker.currency, openingBalance: Number(newAccountBalance) }),
      });
      setFinanceAccounts((current) => [...current, response.account]);
      setNewAccountName("");
      setNewAccountBalance("0");
      setFinanceMessage("Account added.");
    } catch (error) {
      setFinanceError(error instanceof Error ? error.message : "Unable to add account.");
    }
  }

  async function deleteAccount(account: FinanceAccount) {
    if (!tracker.id || !window.confirm(`Remove account "${account.name}"?`)) return;
    try {
      await apiFetch<void>(`/trackers/${tracker.id}/accounts/${account.id}`, { method: "DELETE" });
      setFinanceAccounts((current) => current.filter((item) => item.id !== account.id));
    } catch (error) {
      setFinanceError(error instanceof Error ? error.message : "Unable to remove account.");
    }
  }

  async function downloadBackup() {
    if (!tracker.id) return;
    try {
      const backup = await apiFetch<Record<string, unknown>>(`/trackers/${tracker.id}/backup`);
      const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `hearthy-backup-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
      setFinanceMessage("Backup downloaded.");
    } catch (error) {
      setFinanceError(error instanceof Error ? error.message : "Unable to download backup.");
    }
  }

  async function restoreBackup(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !tracker.id) return;
    setFinanceError("");
    try {
      const backup = JSON.parse(await file.text());
      const collections = ["expenses", "loans", "incomes", "recurring", "goals", "categories", "accounts", "transfers", "reconciliations", "loanPayments"];
      if (backup?.format !== "hearthy-backup" || backup?.version !== 1 || collections.some((key) => !Array.isArray(backup[key]))) {
        throw new Error("This file is not a complete, supported Hearthy backup.");
      }
      const counts = [
        `${backup.expenses.length} expenses`,
        `${backup.incomes.length} income records`,
        `${backup.goals.length} savings goals`,
        `${backup.accounts.length} accounts`,
      ].join(", ");
      const trackerName = typeof backup.tracker?.name === "string" ? backup.tracker.name : tracker.name;
      if (!window.confirm(`Restore tracker “${trackerName}” (${counts})? This permanently replaces the current tracker’s saved finance data.`)) return;
      await apiFetch<{ ok: boolean }>(`/trackers/${tracker.id}/backup`, { method: "POST", body: JSON.stringify(backup) });
      const [expenses, loans, incomes, recurring, goals, accounts, categories] = await Promise.all([
        apiFetch<{ expenses: any[] }>(`/trackers/${tracker.id}/expenses`),
        apiFetch<{ loans: MoneyRecord[] }>(`/trackers/${tracker.id}/loans`),
        apiFetch<{ incomes: IncomeRecord[] }>(`/trackers/${tracker.id}/incomes`),
        apiFetch<{ recurring: RecurringRecord[] }>(`/trackers/${tracker.id}/recurring`),
        apiFetch<{ goals: SavingsGoal[] }>(`/trackers/${tracker.id}/goals`),
        apiFetch<{ accounts: FinanceAccount[] }>(`/trackers/${tracker.id}/accounts`),
        apiFetch<{ categories: CustomCategory[] }>(`/trackers/${tracker.id}/categories`),
      ]);
      setTracker((current) => ({ ...current, ...backup.tracker }));
      setExpenseCurrency(backup.tracker?.currency || tracker.currency);
      setIncomeCurrency(backup.tracker?.currency || tracker.currency);
      setBudget(Number(backup.tracker?.budget) || 0);
      setUserTransactions(expenses.expenses.map(mapExpenseToTransaction));
      setMoneyRecords(loans.loans);
      setIncomeRecords(incomes.incomes);
      setRecurringRecords(recurring.recurring);
      setSavingsGoals(goals.goals);
      setFinanceAccounts(accounts.accounts);
      setCustomCategories(categories.categories);
      setFinanceMessage("Backup restored.");
    } catch (error) {
      setFinanceError(error instanceof Error ? error.message : "Unable to restore this backup.");
    }
  }

  async function saveMoneyRecord() {
    if (!tracker.id) {
      setMoneyError("Your tracker is still loading. Please try again.");
      return;
    }

    setSavingMoneyRecord(true);
    setMoneyError("");
    try {
      const body = {
        direction: moneyDirection,
        person: moneyPerson.trim(),
        amount: Number(moneyAmount),
        currency: moneyCurrency,
        dueDate: moneyDueDate,
        note: moneyNote.trim(),
        status: moneyRecords.find((record) => record.id === moneyRecordId)?.status ?? "open",
      };
      const response = await apiFetch<{ loan: MoneyRecord }>(
        `/trackers/${tracker.id}/loans${moneyRecordId ? `/${moneyRecordId}` : ""}`,
        { method: moneyRecordId ? "PUT" : "POST", body: JSON.stringify(body) },
      );
      setMoneyRecords((current) => moneyRecordId
        ? current.map((record) => record.id === moneyRecordId ? response.loan : record)
        : [...current, response.loan]);
      setShowModal(false);
      setMoneyRecordId(null);
    } catch (error) {
      setMoneyError(error instanceof Error ? error.message : "Unable to save this money record.");
    } finally {
      setSavingMoneyRecord(false);
    }
  }

  async function toggleMoneyRecordStatus(record: MoneyRecord) {
    if (!tracker.id) return;

    try {
      const response = await apiFetch<{ loan: MoneyRecord }>(`/trackers/${tracker.id}/loans/${record.id}`, {
        method: "PUT",
        body: JSON.stringify({
          direction: record.direction,
          person: record.person,
          amount: record.amount,
          currency: record.currency,
          dueDate: record.dueDate,
          note: record.note,
          status: record.status === "open" ? "settled" : "open",
        }),
      });
      setMoneyRecords((current) => current.map((item) => item.id === record.id ? response.loan : item));
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Unable to update repayment status.");
    }
  }

  async function addLoanPayment(record: MoneyRecord) {
    if (!tracker.id || record.status !== "open") return;
    const remaining = record.remainingAmount ?? record.amount - (record.paidAmount ?? 0);
    const input = window.prompt(`Remaining ${formatMoney(remaining, record.currency)}. Enter repayment amount:`, String(remaining));
    if (input === null) return;
    const amount = Number(input);
    if (!Number.isFinite(amount) || amount <= 0) {
      setFinanceError("Enter a repayment amount greater than zero.");
      return;
    }
    try {
      const response = await apiFetch<{ loan: MoneyRecord }>(`/trackers/${tracker.id}/loans/${record.id}/payments`, {
        method: "POST",
        body: JSON.stringify({ amount, date: new Date().toISOString() }),
      });
      setMoneyRecords((current) => current.map((item) => item.id === record.id ? response.loan : item));
      setFinanceMessage("Repayment recorded.");
    } catch (error) {
      setFinanceError(error instanceof Error ? error.message : "Unable to record repayment.");
    }
  }

  async function undoLoanPayment(record: MoneyRecord) {
    const latest = record.payments?.[record.payments.length - 1];
    if (!tracker.id || !latest || !window.confirm(`Remove the last repayment of ${formatMoney(latest.amount, record.currency)}?`)) return;
    try {
      const response = await apiFetch<{ loan: MoneyRecord }>(`/trackers/${tracker.id}/loans/${record.id}/payments/${latest.id}`, { method: "DELETE" });
      setMoneyRecords((current) => current.map((item) => item.id === record.id ? response.loan : item));
    } catch (error) {
      setFinanceError(error instanceof Error ? error.message : "Unable to undo repayment.");
    }
  }

  async function deleteMoneyRecord(record: MoneyRecord) {
    if (!tracker.id || !window.confirm(`Delete the record with ${record.person}? This cannot be undone.`)) return;

    try {
      await apiFetch<void>(`/trackers/${tracker.id}/loans/${record.id}`, { method: "DELETE" });
      setMoneyRecords((current) => current.filter((item) => item.id !== record.id));
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Unable to delete this money record.");
    }
  }

  if (adminToken && adminOverview) {
    return <AdminDashboard data={adminOverview} onSignOut={() => setAdminToken(null)} />;
  }

  if (adminToken) {
    return <main className="account-loading" role="status">{adminLoadError || "Loading administrator overview…"}</main>;
  }

  if (membershipExpired && user) {
    return <MembershipRenewalPage
      email={user.email}
      expiresAt={user.membershipExpiresAt || ""}
      cancelled={new URLSearchParams(window.location.search).get("membership") === "cancelled"}
      loading={loadingAuth}
      demoPaymentsEnabled={demoPaymentsEnabled}
      error={authError}
      onRenew={startMembershipCheckout}
      onDemoPayment={completeDemoMembershipPayment}
      onSignOut={() => void logoutUser()}
    />;
  }

  if (loadingAccount) {
    return <main className="account-loading" role="status">Loading your Hearthy account…</main>;
  }

  if (showSetup) {
    return <TrackerSetup onBack={() => { void logoutUser(); setAuthMode("login"); }} onComplete={handleSetupComplete} />;
  }

  if (!isAuthenticated || !user) {
    return <AuthPage
      mode={authMode}
      setMode={setAuthMode}
      onSubmit={handleAuthSubmit}
      loading={loadingAuth}
      error={authError || adminLoadError}
    />;
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark"><span /><span /><span /></div>
          <strong>hearthy</strong>
        </div>

        <nav className="side-nav" aria-label="Main navigation">
          <p className="nav-label">Workspace</p>
          {navItems.map((item) => (
            <button
              type="button"
              className={`nav-item ${activeNav === item.label ? "active" : ""}`}
              key={item.label}
              onClick={() => handleNavClick(item.label)}
              aria-current={activeNav === item.label ? "page" : undefined}
            >
              <Icon name={item.icon} />
              <span>{item.label}</span>
            </button>
          ))}
          <p className="nav-label nav-label-secondary">Manage</p>
          <button type="button" className={`nav-item ${activeNav === "Settings" ? "active" : ""}`} onClick={() => handleNavClick("Settings")} aria-current={activeNav === "Settings" ? "page" : undefined}>
            <Icon name="settings" />
            <span>Settings</span>
          </button>
        </nav>

        <div className="sidebar-tip">
          <div className="tip-art"><i /><i /><i /></div>
          <p>A gentler way to budget</p>
          <strong>{budget > 0 ? "A little progress today adds up over time." : "Give every dollar a direction with your first budget."}</strong>
          <button type="button" onClick={budget > 0 ? () => handleNavClick("Analytics") : openBudget}>
            {budget > 0 ? "Explore your insights" : "Set a budget"} <Icon name="chevron" size={15} />
          </button>
        </div>

        <div className="profile">
          <div className="avatar">{user.avatar ? <img src={user.avatar} alt="" /> : user.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase()}</div>
          <div>
            <strong>{user.name}</strong>
            <span>{user.email}</span>
          </div>
        </div>
      </aside>

      <main>
        <header className="topbar">
          <div className="mobile-brand brand" aria-label="Hearthy home">
            <div className="brand-mark"><span /><span /><span /></div>
            <strong>hearthy</strong>
          </div>
          <div className="search">
            <Icon name="search" size={16} />
            <input ref={searchInputRef} type="search" aria-label="Search transactions" value={transactionSearch} onChange={(event) => setTransactionSearch(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") handleNavClick("Transactions"); }} placeholder="Search transactions · Enter to view" />
            <kbd>Ctrl K</kbd>
          </div>

          <div className="top-actions">
            <label className="tracker-switcher">
              <span className="tracker-switcher-label">Tracker</span>
              <select value={tracker.id ?? ""} onChange={(event) => void switchTracker(event.target.value)} disabled={loadingTracker} aria-label="Select budget tracker">
                {trackers.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}
              </select>
            </label>
            <button type="button" className="new-tracker-button" onClick={openCreateTracker} disabled={loadingTracker} aria-label="Create a new tracker"><Icon name="plus" size={16} /><span>New tracker</span></button>
            <label className="currency-switch" title="Reporting currency">
              <span>{currencies.find((item) => item.code === tracker.currency)?.symbol}</span>
              <select value={tracker.currency} onChange={(event) => setTracker({ ...tracker, currency: event.target.value })} aria-label="Reporting currency">
                {currencies.map((item) => <option value={item.code} key={item.code}>{item.code}</option>)}
              </select>
            </label>
            <button type="button" className="icon-button" aria-label={`View alerts (${Number(Boolean(budgetAlertLevel)) + dueBillsCount + overdueMoneyCount})`} onClick={() => handleNavClick("Finance")}><Icon name="bell" /><span className="notification-dot" style={{ opacity: budgetAlertLevel || dueBillsCount || overdueMoneyCount ? 1 : 0 }} /></button>
            <button type="button" className="primary-button" onClick={openExpense}><Icon name="plus" size={18} /> {budget === 0 ? "Add your budget" : "Add expense"}</button>
            <button type="button" className="topbar-signout" onClick={() => void logoutUser()}>Sign out</button>
          </div>
        </header>

        <section className="content">
          <div className="page-heading">
            <div>
              <p className="eyebrow">{new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })} · {tracker.name}</p>
              <h1>{activeNav === "Overview"
                ? `${new Date().getHours() < 12 ? "Good morning" : new Date().getHours() < 18 ? "Good afternoon" : "Good evening"}, ${user.name.split(" ")[0]}.`
                : activeNav}</h1>
              <p>{activeNav === "Overview"
                ? userTransactions.length === 0 && incomeRecords.length === 0
                  ? "Your money dashboard is ready. Add a transaction to see your progress take shape."
                  : `Here’s your ${tracker.context.toLowerCase()} money snapshot${tracker.destination ? ` for ${tracker.destination}` : ""}.`
                : pageDescriptions[activeNav] ?? ""}</p>
            </div>
            {(activeNav === "Overview" || activeNav === "Analytics") && <div className="period-picker">
              {['This week', 'This month', 'This year'].map((item) => (
                <button type="button" className={period === item ? "selected" : ""} onClick={() => setPeriod(item as "This week" | "This month" | "This year")} key={item} aria-pressed={period === item}>{item}</button>
              ))}
            </div>}
          </div>

          {activeNav === "Settings" && <section className="panel profile-settings-panel">
            <div className="panel-head">
              <div>
                <p className="eyebrow">Profile settings</p>
                <h2>Personal details</h2>
                <p>Update your profile picture, username, password, and security preferences.</p>
              </div>
            </div>

            <div className="profile-settings-layout">
              <form className="profile-settings-form" onSubmit={saveProfile}>
                <div className="profile-avatar-row">
                  <div className="profile-avatar-preview" aria-label="Profile picture preview">
                    {profileForm.avatar ? <img src={profileForm.avatar} alt="Profile preview" /> : <span>{user.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "U"}</span>}
                  </div>
                  <label className="upload-button">
                    <input type="file" accept="image/*" onChange={handleProfilePictureUpload} />
                    Upload photo
                  </label>
                </div>

                <label>
                  Username
                  <input value={profileForm.username} onChange={(event) => setProfileForm((current) => ({ ...current, username: event.target.value }))} placeholder="yourname" />
                </label>

                <label>
                  Bio
                  <textarea rows={4} value={profileForm.bio} onChange={(event) => setProfileForm((current) => ({ ...current, bio: event.target.value }))} placeholder="Tell people what matters to you financially." />
                </label>

                <div className="preference-toggles">
                  <label><input type="checkbox" checked={profileForm.emailReminders} onChange={(event) => setProfileForm((current) => ({ ...current, emailReminders: event.target.checked }))} /> Email reminders</label>
                  <label><input type="checkbox" checked={profileForm.browserReminders} onChange={(event) => setProfileForm((current) => ({ ...current, browserReminders: event.target.checked }))} /> Browser reminders</label>
                  <label><input type="checkbox" checked={profileForm.weeklyDigest} onChange={(event) => setProfileForm((current) => ({ ...current, weeklyDigest: event.target.checked }))} /> Weekly summary digest</label>
                </div>

                {(profileError || profileMessage) && <div className={`settings-feedback ${profileError ? "error" : "success"}`}>{profileError || profileMessage}</div>}
                <button type="submit" className="primary-button" disabled={savingProfile}>{savingProfile ? "Saving..." : "Save profile"}</button>
              </form>

              <form className="password-settings-form" onSubmit={updatePassword}>
                <h3>Security</h3>
                <label>
                  Current password
                  <input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} placeholder="Current password" />
                </label>
                <label>
                  New password
                  <input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="At least 12 characters" />
                </label>
                <label>
                  Confirm new password
                  <input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Repeat your new password" />
                </label>
                <button type="submit" className="primary-button secondary-button" disabled={savingPassword}>{savingPassword ? "Updating..." : "Update password"}</button>
              </form>
            </div>
            <div className="settings-signout mobile-settings-signout">
              <div>
                <h3>Sign out</h3>
                <p>Sign out of Hearthy on this device. Your saved tracker data will remain in your account.</p>
              </div>
              <button type="button" className="settings-signout-button" onClick={() => void logoutUser()}>Sign out</button>
            </div>
          </section>}

          {activeNav === "Analytics" && <div className="analysis-strip">
            <div className="analysis-card">
              <span>{period} spend</span>
              <strong>{formatMoney(periodTotalSpent, tracker.currency)}</strong>
              <small>{periodTransactions.length} expense{periodTransactions.length === 1 ? "" : "s"}</small>
            </div>
            <div className="analysis-card">
              <span>Average</span>
              <strong>{formatMoney(averageSpend, tracker.currency)}</strong>
              <small>Per transaction</small>
            </div>
            <div className="analysis-card">
              <span>Top category</span>
              <strong>{topCategory ? topCategory[0] : "No data"}</strong>
              <small>{topCategory ? formatMoney(topCategory[1], tracker.currency) : "Add an expense to get started"}</small>
            </div>
            <div className="analysis-card">
              <span>Trend</span>
              <strong>{previousPeriodTotal > 0 ? `${Math.abs(periodVariance).toFixed(1)}%` : "—"}</strong>
              <small>{previousPeriodTotal > 0 ? `${periodVariance > 0 ? "Higher" : periodVariance < 0 ? "Lower" : "Same"} than last period` : "Add data from a previous period to compare"}</small>
            </div>
            <div className="analysis-card">
              <span>{period} income</span>
              <strong>{formatMoney(periodIncome, tracker.currency)}</strong>
              <small>{periodIncomeRecords.length} income record{periodIncomeRecords.length === 1 ? "" : "s"}</small>
            </div>
            <div className="analysis-card">
              <span>Net cash flow</span>
              <strong className={netCashFlow >= 0 ? "cashflow-positive" : "cashflow-negative"}>{formatMoney(netCashFlow, tracker.currency)}</strong>
              <small>Income minus spending</small>
            </div>
          </div>}

          {(activeNav === "Overview" || activeNav === "Finance") && (budgetAlertLevel || dueBillsCount > 0) && (
            <div className={`finance-alert-stack ${budgetAlertLevel === "exceeded" ? "critical" : ""}`} role="status">
              {budgetAlertLevel && <span><strong>{budgetAlertLevel === "exceeded" ? "Budget exceeded" : "Budget warning"} · {budgetUsed.toFixed(0)}% used</strong><button type="button" onClick={openSetBudget}>Review budget</button></span>}
              {dueBillsCount > 0 && <span><strong>{dueBillsCount} recurring payment{dueBillsCount === 1 ? "" : "s"} due within 7 days.</strong><button type="button" onClick={() => handleNavClick("Finance")}>Review bills</button></span>}
            </div>
          )}
          {(financeError || financeMessage) && <p className={`finance-feedback ${financeError ? "error" : ""}`} role={financeError ? "alert" : "status"}>{financeError || financeMessage}<button type="button" onClick={() => { setFinanceError(""); setFinanceMessage(""); }} aria-label="Dismiss message">×</button></p>}

          {activeNav === "Overview" && <div className="summary-grid">
            <article className="balance-card">
              <div className="card-label"><span>Budget remaining</span><span className={`status-pill ${budget === 0 ? "unbudgeted" : budgetAlertLevel}`}>{budget === 0 ? "No budget yet" : budgetAlertLevel === "exceeded" ? "Over budget" : budgetAlertLevel === "near" ? "Near limit" : "On track"}</span></div>
              <h2>{budget > 0 ? formatMoney(availableBalance, tracker.currency) : "Set a budget"}</h2>
              <p>{budget === 0 ? "Add a monthly budget to see what you have left." : <><span className="trend-up"><Icon name="arrowUp" size={14} /> {Math.max(0, Math.round(100 - budgetUsed))}%</span> of your budget remains</>}</p>
              <div className="balance-art" aria-hidden="true">
                <span /><span /><span /><span />
              </div>
            </article>

            <article className="stat-card">
              <div className="stat-icon income"><Icon name="arrowDown" /></div>
              <div className="stat-copy"><span>Budget</span><strong>{formatMoney(budget, tracker.currency)}</strong><small><button type="button" className="inline-action" onClick={openBudget}>{budget === 0 ? "Add your first budget" : "Add more budget"}</button>{budget > 0 && <> · <button type="button" className="inline-action" onClick={openSetBudget}>Set total</button></>}</small></div>
            </article>

            <article className="stat-card">
              <div className="stat-icon expense"><Icon name="arrowUp" /></div>
              <div className="stat-copy"><span>Spent this month</span><strong>{formatMoney(budgetMonthSpent, tracker.currency)}</strong><small>{budget > 0 ? `${budgetUsed.toFixed(1)}% of budget` : "No expenses yet"}</small></div>
            </article>
          </div>}

          {activeNav === "Overview" && <>
            <section className="overview-quick-actions" aria-label="Quick actions">
              <div>
                <p className="eyebrow">Quick actions</p>
                <h2>What would you like to do?</h2>
              </div>
              <div className="overview-action-list">
                <button type="button" className="overview-action primary" onClick={openExpense}><Icon name="plus" size={16} /> Add expense</button>
                <button type="button" className="overview-action" onClick={openIncome}><Icon name="arrowDown" size={16} /> Add income</button>
                <button type="button" className="overview-action" onClick={openGoal}><Icon name="target" size={16} /> Create a goal</button>
              </div>
            </section>

            <div className="overview-dashboard-grid">
              <section className="panel overview-card">
                <div className="panel-head">
                  <div><h2>Recent activity</h2><p>Your latest income and expenses</p></div>
                  <button type="button" className="text-button" onClick={() => handleNavClick("Transactions")}>All transactions <Icon name="chevron" size={14} /></button>
                </div>
                {recentActivity.length > 0 ? <div className="overview-activity-list">
                  {recentActivity.map((activity) => (
                    <button type="button" className="overview-activity-row" key={activity.id} onClick={() => activity.transaction ? openTransactionDetails(activity.transaction) : handleNavClick("Finance")} aria-label={`View ${activity.title} details`}>
                      <span className={`overview-activity-icon ${activity.direction}`}><Icon name={activity.direction === "in" ? "arrowDown" : "arrowUp"} size={16} /></span>
                      <span className="overview-activity-copy"><strong>{activity.title}</strong><small>{activity.detail}</small></span>
                      <strong className={`overview-activity-amount ${activity.direction}`}>{activity.direction === "in" ? "+" : "−"}{formatMoney(activity.amount, activity.currency)}</strong>
                    </button>
                  ))}
                </div> : <div className="overview-empty-state">
                  <p>Your recent activity will show up here.</p>
                  <button type="button" className="text-button" onClick={openExpense}>Record your first expense <Icon name="chevron" size={14} /></button>
                </div>}
              </section>

              <section className="panel overview-card">
                <div className="panel-head">
                  <div><h2>Monthly budget</h2><p>Spending progress for this month</p></div>
                  <button type="button" className="text-button" onClick={budget === 0 ? openBudget : openSetBudget}>{budget === 0 ? "Set budget" : "Edit budget"}</button>
                </div>
                {budget > 0 ? <>
                  <div className="overview-budget-summary">
                    <strong>{formatMoney(budgetMonthSpent, tracker.currency)}</strong>
                    <span>of {formatMoney(budget, tracker.currency)} spent</span>
                  </div>
                  <div className={`overview-progress-track ${budgetAlertLevel ?? ""}`} role="progressbar" aria-label="Monthly budget used" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(Math.round(budgetUsed), 100)}>
                    <span style={{ width: `${Math.min(Math.max(budgetUsed, 0), 100)}%` }} />
                  </div>
                  <div className="overview-budget-foot">
                    <span>{budgetUsed.toFixed(0)}% used</span>
                    <strong className={budgetMonthSpent > budget ? "cashflow-negative" : "cashflow-positive"}>
                      {budgetMonthSpent > budget
                        ? `${formatMoney(budgetMonthSpent - budget, tracker.currency)} over budget`
                        : `${formatMoney(availableBalance, tracker.currency)} remaining`}
                    </strong>
                  </div>
                </> : <div className="overview-empty-state">
                  <p>Set a monthly budget to track how much you have left to spend.</p>
                  <button type="button" className="text-button" onClick={openBudget}>Set your budget <Icon name="chevron" size={14} /></button>
                </div>}
              </section>

              <section className="panel overview-card">
                <div className="panel-head">
                  <div><h2>{period} cash flow</h2><p>Income compared with spending</p></div>
                  <button type="button" className="text-button" onClick={() => handleNavClick("Analytics")}>View analytics <Icon name="chevron" size={14} /></button>
                </div>
                {(periodIncome > 0 || periodTotalSpent > 0) ? <>
                  <div className="overview-cashflow-total">
                    <span>Net cash flow</span>
                    <strong className={netCashFlow >= 0 ? "cashflow-positive" : "cashflow-negative"}>{formatMoney(netCashFlow, tracker.currency)}</strong>
                  </div>
                  <div className="overview-cashflow-bars" aria-label={`${period} income and spending`}>
                    <div className="overview-cashflow-row">
                      <span>Income</span>
                      <div className="overview-progress-track"><span className="income-fill" style={{ width: `${Math.max(periodIncome > 0 ? 4 : 0, (periodIncome / Math.max(periodIncome, periodTotalSpent, 1)) * 100)}%` }} /></div>
                      <strong>{formatMoney(periodIncome, tracker.currency)}</strong>
                    </div>
                    <div className="overview-cashflow-row">
                      <span>Spending</span>
                      <div className="overview-progress-track"><span className="spending-fill" style={{ width: `${Math.max(periodTotalSpent > 0 ? 4 : 0, (periodTotalSpent / Math.max(periodIncome, periodTotalSpent, 1)) * 100)}%` }} /></div>
                      <strong>{formatMoney(periodTotalSpent, tracker.currency)}</strong>
                    </div>
                  </div>
                </> : <div className="overview-empty-state">
                  <p>No income or spending recorded for this period yet.</p>
                  <button type="button" className="text-button" onClick={openIncome}>Record income <Icon name="chevron" size={14} /></button>
                </div>}
              </section>

              <section className="panel overview-card">
                <div className="panel-head">
                  <div><h2>Coming up</h2><p>Your next recurring bills</p></div>
                  <button type="button" className="text-button" onClick={() => handleNavClick("Finance")}>Manage bills <Icon name="chevron" size={14} /></button>
                </div>
                {upcomingExpenseBills.length > 0 ? <div className="overview-upcoming-list">
                  {upcomingExpenseBills.map((bill) => (
                    <button type="button" className="overview-upcoming-row" key={bill.id} onClick={() => handleNavClick("Finance")} aria-label={`Manage recurring payment ${bill.name}`}>
                      <span className="overview-date-badge">
                        <strong>{new Date(`${bill.nextDue}T12:00:00`).toLocaleDateString(undefined, { day: "numeric" })}</strong>
                        <small>{new Date(`${bill.nextDue}T12:00:00`).toLocaleDateString(undefined, { month: "short" })}</small>
                      </span>
                      <span className="overview-upcoming-copy"><strong>{bill.name}</strong><small>{getDueLabel(bill.nextDue)} · {bill.frequency}</small></span>
                      <strong className="overview-upcoming-amount">{formatMoney(bill.amount, bill.currency)}</strong>
                    </button>
                  ))}
                </div> : <div className="overview-empty-state">
                  <p>No upcoming bills. Add recurring payments to keep track of what’s due.</p>
                  <button type="button" className="text-button" onClick={() => handleNavClick("Finance")}>Add a recurring bill <Icon name="chevron" size={14} /></button>
                </div>}
              </section>

              <section className="panel overview-card overview-goals-card">
                <div className="panel-head">
                  <div><h2>Savings goals</h2><p>A little progress adds up</p></div>
                  <button type="button" className="text-button" onClick={() => handleNavClick("Goals")}>{savingsGoals.length > 0 ? "View goals" : "Create a goal"} <Icon name="chevron" size={14} /></button>
                </div>
                {overviewGoalPreviews.length > 0 ? <div className="overview-goal-list">
                  {overviewGoalPreviews.map((goal) => {
                    const progress = goal.targetAmount > 0 ? Math.min(100, (goal.currentAmount / goal.targetAmount) * 100) : 0;
                    return <button type="button" className="overview-goal-row" key={goal.id} onClick={() => { setContributingGoalId(goal.id); setGoalContribution(""); handleNavClick("Goals"); }} aria-label={`Contribute to ${goal.name}`}>
                      <div className="overview-goal-heading"><strong>{goal.name}</strong><span>{progress.toFixed(0)}%</span></div>
                      <div className="overview-progress-track"><span className="goal-fill" style={{ width: `${progress}%` }} /></div>
                      <small>{formatMoney(goal.currentAmount, goal.currency)} of {formatMoney(goal.targetAmount, goal.currency)}</small>
                    </button>;
                  })}
                </div> : <div className="overview-empty-state">
                  <p>Give something you care about a savings target.</p>
                  <button type="button" className="text-button" onClick={() => handleNavClick("Goals")}>Create your first goal <Icon name="chevron" size={14} /></button>
                </div>}
              </section>
            </div>
          </>}

          {activeNav === "Analytics" && <div className="dashboard-grid">
            <article className="panel spending-panel">
              <div className="panel-head">
                <div><h2>Cash flow overview</h2><p>Income and spending {chartPeriodLabel}</p></div>
                <button type="button" className="text-button" onClick={() => handleNavClick("Transactions")}>Explore transactions <Icon name="chevron" size={15} /></button>
              </div>
              <div className="chart-metrics">
                <div><span>{chartMonths.length}-month spending</span><strong>{formatMoney(chartTotalSpend, tracker.currency)}</strong><small>Income {formatMoney(chartTotalIncome, tracker.currency)}</small></div>
                <div className="legend"><i className="income-line-key" /> Income <i className="spend-line-key" /> Spending</div>
              </div>
              {hasCashFlowData ? <div className="chart-wrap">
                <div className="axis-labels">{[4, 3, 2, 1, 0].map((step) => <span key={step}>{formatMoney((chartScale * step) / 4, tracker.currency, true)}</span>)}</div>
                <svg viewBox="0 0 620 190" preserveAspectRatio="none" role="img" aria-label={`Income and spending ${chartPeriodLabel}`}>
                  <defs>
                    <linearGradient id="area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#1f4d3c" stopOpacity=".16" /><stop offset="1" stopColor="#1f4d3c" stopOpacity="0" /></linearGradient>
                  </defs>
                  <g className="grid-lines"><path d="M0 10H620M0 52H620M0 94H620M0 136H620M0 178H620" /></g>
                  {chartData.length > 1 && <path className="area" d={chartAreaPath} />}
                  <path className="income-line" d={incomeChartPath} />
                  <path className="spend-line" d={spendingChartPath} />
                </svg>
                <div className={`month-labels${chartMonths.length === 1 ? " single-month-label" : ""}`}>{chartMonths.map((month) => <span key={`${month.getFullYear()}-${month.getMonth()}`}>{month.toLocaleDateString(undefined, { month: "short" })}</span>)}</div>
              </div> : <div className="chart-empty-state">
                <span className="chart-empty-icon"><Icon name="chart" size={19} /></span>
                <div><strong>Your cash flow will appear here</strong><p>Record income or spending to bring your chart to life.</p></div>
                <button type="button" className="text-button" onClick={budget === 0 ? openBudget : openExpense}>{budget === 0 ? "Set a budget" : "Add an expense"} <Icon name="chevron" size={15} /></button>
              </div>}
            </article>

            <article className="panel budget-panel">
              <div className="panel-head">
                <div><h2>Budget by category</h2><p>{new Date().toLocaleDateString(undefined, { month: "long", year: "numeric" })}</p></div>
                <button type="button" className="text-button" onClick={() => showCategoryTransactions()}>View all</button>
              </div>
              <div className="budget-total"><span><strong>{formatMoney(budgetMonthSpent, tracker.currency, true)}</strong> spent</span><span>of {formatMoney(budget, tracker.currency, true)}</span></div>
              <div className="total-track"><span style={{ width: `${Math.min(budgetUsed, 100)}%` }} /></div>
              <div className="category-list">
                {monthlyCategoryTotals.map((category) => (
                  <button type="button" className="category category-button" key={category.name} onClick={() => showCategoryTransactions(category.name)} aria-label={`View ${category.name} transactions`}>
                    <div><span><i className={category.color} />{category.name}</span><strong>{formatMoney(category.value, tracker.currency, true)}</strong></div>
                    <div className="category-track"><span className={category.color} style={{ width: `${category.percent}%` }} /></div>
                  </button>
                ))}
                {monthlyCategoryTotals.length === 0 && <p className="finance-empty">Add an expense this month to see your top categories.</p>}
              </div>
              <div className="budget-note"><span>✦</span><p><strong>{budget === 0 ? "Ready when you are." : budgetUsed >= 100 ? "Budget fully used." : "You’re making progress."}</strong><br />{budget === 0 ? "Add your own budget to start tracking." : budgetUsed >= 100 ? "Review your spending or adjust your budget." : `${formatMoney(availableBalance, tracker.currency)} remains in your budget.`}</p></div>
            </article>
          </div>}

          {(activeNav === "Finance" || activeNav === "Goals" || activeNav === "Settings") && <div className="finance-feature-grid">
            {activeNav === "Finance" && <section className="panel finance-feature-panel">
              <div className="panel-head"><div><h2>Income</h2><p>Add income to see your net cash flow for {period.toLowerCase()}.</p></div></div>
              <form className="finance-inline-form" onSubmit={saveIncome}>
                <label>Source<input required maxLength={100} value={incomeName} onChange={(event) => setIncomeName(event.target.value)} placeholder="Salary, freelance..." /></label>
                <div className="form-row">
                  <label>Amount<input required type="number" min="0.01" step="0.01" value={incomeAmount} onChange={(event) => setIncomeAmount(event.target.value)} /></label>
                  <label>Date<input required type="date" value={incomeDate} onChange={(event) => setIncomeDate(event.target.value)} /></label>
                </div>
                <div className="form-row">
                  <label>Category<select value={incomeCategory} onChange={(event) => setIncomeCategory(event.target.value)}>
                    {["Salary", "Freelance", "Investment", ...customCategories.filter((category) => category.kind === "income").map((category) => category.name)].map((category) => <option key={category}>{category}</option>)}
                  </select></label>
                  <label>Account<select value={incomeAccount} onChange={(event) => setIncomeAccount(event.target.value)}><option value="">Unassigned</option>{financeAccounts.map((account) => <option value={account.id} key={account.id}>{account.name}</option>)}</select></label>
                </div>
                <button type="submit" className="primary-button" disabled={savingFinance}>{savingFinance ? "Saving..." : "Record income"}</button>
              </form>
              <div className="finance-record-list">
                {incomeRecords.slice(0, 5).map((income) => <div className="finance-record-row" key={income.id}>
                  <span><strong>{income.name}</strong><small>{income.category} · {new Date(income.date).toLocaleDateString()}</small></span>
                  <span className="finance-record-end"><strong className="cashflow-positive">+{formatMoney(income.amount, income.currency)}</strong><span className="finance-record-actions"><button type="button" onClick={() => openIncomeForEdit(income)}>Edit</button><button type="button" onClick={() => void deleteIncome(income)}>Delete</button></span></span>
                </div>)}
                {incomeRecords.length === 0 && <p className="finance-empty">Income you record will appear here.</p>}
              </div>
            </section>}

            {activeNav === "Finance" && <section className="panel finance-feature-panel" id="recurring-payments">
              <div className="panel-head"><div><h2>Recurring bills</h2><p>See upcoming subscriptions and mark bills paid.</p></div></div>
              <details className="finance-add-details" id="recurring-payment-form">
                <summary>{editingRecurringId ? "Edit recurring payment" : "Add a recurring payment"}</summary>
                <form className="finance-inline-form" onSubmit={saveRecurring}>
                  <label>Name<input required maxLength={100} value={recurringName} onChange={(event) => setRecurringName(event.target.value)} placeholder="Rent, streaming..." /></label>
                  <div className="form-row">
                    <label>Amount<input required type="number" min="0.01" step="0.01" value={recurringAmount} onChange={(event) => setRecurringAmount(event.target.value)} /></label>
                    <label>Frequency<select value={recurringFrequency} onChange={(event) => setRecurringFrequency(event.target.value as RecurringRecord["frequency"])}><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="yearly">Yearly</option></select></label>
                  </div>
                  <label>Schedule type<select value={recurringKind} onChange={(event) => setRecurringKind(event.target.value as "income" | "expense")}><option value="expense">Recurring bill</option><option value="income">Recurring income</option></select></label>
                  <div className="form-row">
                    <label>Next due<input required type="date" value={recurringDue} onChange={(event) => setRecurringDue(event.target.value)} /></label>
                    <label>Pay from<select value={recurringAccount} onChange={(event) => setRecurringAccount(event.target.value)}><option value="">Unassigned</option>{financeAccounts.map((account) => <option value={account.id} key={account.id}>{account.name}</option>)}</select></label>
                  </div>
                  <label>Currency<select value={recurringCurrency} onChange={(event) => setRecurringCurrency(event.target.value)}>{currencies.map((item) => <option value={item.code} key={item.code}>{item.code} · {item.symbol}</option>)}</select></label>
                  <div className="recurring-form-actions">
                    <button type="submit" className="primary-button" disabled={savingFinance}>{savingFinance ? "Saving..." : editingRecurringId ? "Save changes" : "Add payment"}</button>
                    {editingRecurringId && <button type="button" className="text-button" onClick={cancelRecurringEdit}>Cancel</button>}
                  </div>
                </form>
              </details>
              <div className="finance-record-list">
                {upcomingBills.slice(0, 6).map((bill) => <div className="finance-record-row" key={bill.id}>
                  <span><strong>{bill.name}{bill.active ? "" : " · paused"}</strong><small>{bill.kind === "income" ? "Income" : "Bill"} · {bill.frequency} · {getDueLabel(bill.nextDue)}</small></span>
                  <span className="finance-record-end"><strong>{formatMoney(bill.amount, bill.currency)}</strong><span className="finance-record-actions">{bill.active && <button type="button" onClick={() => void recordRecurringPayment(bill)}>{bill.kind === "income" ? "Mark received" : "Mark paid"}</button>}<button type="button" onClick={() => openRecurringForEdit(bill)}>Edit</button><button type="button" onClick={() => void toggleRecurring(bill)}>{bill.active ? "Pause" : "Resume"}</button><button type="button" onClick={() => void deleteRecurring(bill)}>Delete</button></span></span>
                </div>)}
                {upcomingBills.length === 0 && <p className="finance-empty">No recurring payments added yet.</p>}
              </div>
            </section>}

            {activeNav === "Goals" && <section className="panel finance-feature-panel">
              <div className="panel-head"><div><h2>Savings goals</h2><p>Set a target and track contributions over time.</p></div></div>
              <details className="finance-add-details">
                <summary>Create a savings goal</summary>
                <form className="finance-inline-form" onSubmit={saveGoal}>
                  <label>Goal name<input required maxLength={100} value={goalName} onChange={(event) => setGoalName(event.target.value)} placeholder="Emergency fund, holiday..." /></label>
                  <div className="form-row">
                    <label>Target amount<input required type="number" min="0.01" step="0.01" value={goalTarget} onChange={(event) => setGoalTarget(event.target.value)} /></label>
                    <label>Target date (optional)<input type="date" value={goalDate} onChange={(event) => setGoalDate(event.target.value)} /></label>
                  </div>
                  <button type="submit" className="primary-button" disabled={savingFinance}>{savingFinance ? "Saving..." : "Create goal"}</button>
                </form>
              </details>
              <div className="finance-record-list">
                {savingsGoals.map((goal) => {
                  const progress = Math.min(100, (goal.currentAmount / goal.targetAmount) * 100);
                  return <div className="goal-item" key={goal.id}>
                    <div className="goal-heading"><span><strong>{goal.name}</strong><small>{goal.targetDate ? `Target ${new Date(`${goal.targetDate}T12:00:00`).toLocaleDateString()}` : "No target date"}</small></span><strong>{progress.toFixed(0)}%</strong></div>
                    <div className="goal-progress"><span style={{ width: `${progress}%` }} /></div>
                    <div className="goal-heading"><small>{formatMoney(goal.currentAmount, goal.currency)} saved</small><small>{formatMoney(goal.targetAmount, goal.currency)} goal</small></div>
                    {contributingGoalId === goal.id ? <form className="goal-contribution" onSubmit={(event) => void contributeToGoal(event, goal)}>
                      <input required aria-label={`Contribution to ${goal.name}`} type="number" min="0.01" step="0.01" value={goalContribution} onChange={(event) => setGoalContribution(event.target.value)} placeholder="Contribution amount" />
                      <button type="submit">Save</button><button type="button" onClick={() => setContributingGoalId("")}>Cancel</button>
                    </form> : <button type="button" className="text-button" onClick={() => { setContributingGoalId(goal.id); setGoalContribution(""); }}>Add contribution</button>}
                    <button type="button" className="goal-delete" onClick={() => void deleteGoal(goal)}>Delete goal</button>
                  </div>;
                })}
                {savingsGoals.length === 0 && <p className="finance-empty">Create a savings goal to start tracking progress.</p>}
              </div>
            </section>}

            {activeNav === "Settings" && <section className="panel finance-feature-panel finance-settings-panel">
              <div className="panel-head"><div><h2>Accounts, categories & backup</h2><p>Organize where money lives and keep your data portable.</p></div></div>
              <details className="finance-add-details">
                <summary>Manage accounts</summary>
                <form className="finance-inline-form compact" onSubmit={saveAccount}>
                  <label>Account name<input required maxLength={60} value={newAccountName} onChange={(event) => setNewAccountName(event.target.value)} placeholder="Everyday checking" /></label>
                  <label>Account type<select value={newAccountType} onChange={(event) => setNewAccountType(event.target.value)}><option value="checking">Checking</option><option value="savings">Savings</option><option value="cash">Cash</option><option value="credit">Credit card</option></select></label>
                  <label>Opening balance<input type="number" step="0.01" value={newAccountBalance} onChange={(event) => setNewAccountBalance(event.target.value)} /></label>
                  <button type="submit" className="primary-button">Add account</button>
                </form>
                {financeAccounts.map((account) => <div className="finance-manage-row" key={account.id}><span>{account.name} · {account.type}</span><button type="button" onClick={() => void deleteAccount(account)}>Remove</button></div>)}
                {accountActivity.map((account) => <div className="account-balance-row" key={`${account.id}-balance`}>
                  <span><strong>{account.name}</strong><small>{account.currency} · Opening {formatMoney(account.openingBalance, account.currency)} · {formatMoney(account.earned, account.currency)} in / {formatMoney(account.spent, account.currency)} out</small></span>
                  <strong className={account.currentBalance >= 0 ? "cashflow-positive" : "cashflow-negative"}>{formatMoney(account.currentBalance, account.currency)}</strong>
                </div>)}
                {Object.entries(accountBalancesByCurrency).map(([currency, total]) => <div className="account-total-row" key={`${currency}-total`}><span>Total {currency} across accounts</span><strong>{formatMoney(total, currency)}</strong></div>)}
              </details>
              <details className="finance-add-details">
                <summary>Custom categories</summary>
                <form className="finance-inline-form compact" onSubmit={saveCustomCategory}>
                  <label>Category name<input required maxLength={60} value={newCategoryName} onChange={(event) => setNewCategoryName(event.target.value)} placeholder="Pet care" /></label>
                  <label>Applies to<select value={newCategoryKind} onChange={(event) => setNewCategoryKind(event.target.value as CustomCategory["kind"])}><option value="expense">Expenses</option><option value="income">Income</option></select></label>
                  <button type="submit" className="primary-button">Add category</button>
                </form>
                {customCategories.map((category) => <div className="finance-manage-row" key={category.id}><span>{category.name} · {category.kind}</span><button type="button" onClick={() => void deleteCustomCategory(category)}>Remove</button></div>)}
              </details>
              <div className="backup-actions">
                <button type="button" className="text-button" onClick={() => void downloadBackup()}>Download full backup</button>
                <label className="text-button backup-restore">Restore backup<input type="file" accept="application/json,.json" onChange={(event) => void restoreBackup(event)} /></label>
                <small>Restore replaces this tracker’s saved finance data.</small>
              </div>
            </section>}
          </div>}

          {activeNav === "Finance" && <section className="panel money-records-panel">
            <div className="panel-head">
              <div>
                <p className="eyebrow">Keep it clear</p>
                <h2>Money lent & borrowed</h2>
                <p>Remember who owes you, who you owe, and when it’s due.</p>
              </div>
              <button type="button" className="primary-button" onClick={() => openMoneyRecord()}><Icon name="plus" size={17} /> Add record</button>
            </div>
            {overdueMoneyCount > 0 && (
              <div className="money-alert" role="status">
                <strong>{overdueMoneyCount} repayment{overdueMoneyCount === 1 ? "" : "s"} overdue</strong>
                <span>Check in with the people listed below.</span>
              </div>
            )}
            <div className="money-summary">
              {Object.entries(moneyTotals).map(([currency, totals]) => (
                <div className="money-summary-currency" key={currency}>
                  <span>{currency} outstanding</span>
                  <div><span>You owe <strong>{formatMoney(totals.borrowed, currency)}</strong></span><span>Owed to you <strong>{formatMoney(totals.lent, currency)}</strong></span></div>
                </div>
              ))}
              {Object.keys(moneyTotals).length === 0 && (
                <div className="money-empty-summary"><span>No money records yet</span><small>Add an amount you lent or borrowed to keep track of repayment dates.</small></div>
              )}
            </div>
            <div className="money-record-list">
              {moneyRecords.map((record) => (
                <article className={`money-record ${record.status}`} key={record.id}>
                  <span className={`money-record-icon ${record.direction}`}>
                    <Icon name={record.direction === "borrowed" ? "arrowDown" : "arrowUp"} size={19} />
                  </span>
                  <div className="money-record-person">
                    <strong>{record.direction === "borrowed" ? `Borrowed from ${record.person}` : `Lent to ${record.person}`}</strong>
                    <small>{record.note || (record.direction === "borrowed" ? "You need to repay this" : "You’re expecting repayment")}</small>
                  </div>
                  <strong className="money-record-amount">{formatMoney(record.amount, record.currency)}</strong>
                  <div className="money-record-due">
                    <span className={record.status === "open" && getDueLabel(record.dueDate).startsWith("Overdue") ? "overdue" : ""}>{record.status === "settled" ? "Settled" : getDueLabel(record.dueDate)}</span>
                    <small>{new Date(`${record.dueDate}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</small>
                    <small>{formatMoney(record.remainingAmount ?? record.amount - (record.paidAmount ?? 0), record.currency)} remaining</small>
                  </div>
                  <div className="money-record-actions">
                    {record.status === "open" && <button type="button" onClick={() => openMoneyRecord(record)}>Edit</button>}
                    {record.status === "open" && <button type="button" onClick={() => void addLoanPayment(record)}>Record payment</button>}
                    {record.payments?.length && <button type="button" onClick={() => void undoLoanPayment(record)}>Undo last</button>}
                    <button type="button" className="delete" onClick={() => void deleteMoneyRecord(record)} aria-label={`Delete record with ${record.person}`}>Delete</button>
                  </div>
                  {record.payments?.length ? <div className="money-payment-history">{record.payments.map((payment) => <small key={payment.id}>{new Date(payment.date).toLocaleDateString()} · {formatMoney(payment.amount, record.currency)}{payment.note ? ` · ${payment.note}` : ""}</small>)}</div> : null}
                </article>
              ))}
            </div>
          </section>}

          {activeNav === "Transactions" && <article className="panel transactions-panel">
            <div className="panel-head">
              <div><h2>Transactions</h2><p>{filteredTransactions.length} of {userTransactions.length} expenses</p></div>
              <div className="transaction-import-actions">
                <button type="button" className="text-button" onClick={openCsvImport}>Import CSV</button>
                <button type="button" className="text-button" onClick={exportTransactions} disabled={filteredTransactions.length === 0 && incomeRecords.length === 0}>Export CSV</button>
              </div>
            </div>
            <div className="transaction-tools">
              <label className="transaction-search">
                <Icon name="search" size={16} />
                <input type="search" value={transactionSearch} onChange={(event) => setTransactionSearch(event.target.value)} placeholder="Search name, category, currency..." aria-label="Search expenses" />
              </label>
              <label className="category-filter">
                <span>Category</span>
                <select value={transactionCategory} onChange={(event) => setTransactionCategory(event.target.value)} aria-label="Filter by category">
                  <option>All categories</option>
                  {transactionCategories.map((category) => <option key={category}>{category}</option>)}
                </select>
              </label>
              {(transactionSearch || transactionCategory !== "All categories") && <button type="button" className="clear-filters-button" onClick={() => { setTransactionSearch(""); setTransactionCategory("All categories"); }}>Clear filters</button>}
            </div>
            <div className="transaction-list">
              {userTransactions.length === 0 ? (
                <div className="empty-transactions">
                  <span><Icon name="wallet" /></span>
                  <div><strong>No expenses yet</strong><p>{budget === 0 ? "Add your budget first, then record expenses as they happen." : "Your tracker is ready. Add your first expense when you spend."}</p></div>
                  <button type="button" className="primary-button" onClick={budget === 0 ? openBudget : openExpense}>{budget === 0 ? "Add budget" : "Add first expense"}</button>
                </div>
              ) : filteredTransactions.length === 0 ? (
                <div className="transaction-no-results" role="status">No expenses match these filters. <button type="button" className="text-button" onClick={() => { setTransactionSearch(""); setTransactionCategory("All categories"); }}>Clear filters</button></div>
              ) : filteredTransactions.map((transaction) => (
                <div className="transaction" key={transaction.id ?? transaction.name}>
                  <span className={`transaction-icon ${transaction.tone}`}><Icon name={transaction.icon} /></span>
                  <span className="transaction-name"><strong>{transaction.name}</strong><small>{transaction.date}{transaction.accountId && ` · ${financeAccounts.find((account) => account.id === transaction.accountId)?.name ?? "Account"}`}{transaction.tags?.length ? ` · ${transaction.tags.join(", ")}` : ""}</small></span>
                  <span className="transaction-category">{transaction.category}</span>
                  <strong className="transaction-amount">-{formatMoney(transaction.amount, transaction.currency)}</strong>
                  <span className="transaction-actions">
                    {transaction.id && <button type="button" onClick={() => openTransactionDetails(transaction)} aria-label={`View details for ${transaction.name}`}>Details</button>}
                    {transaction.receipt && <button type="button" onClick={() => window.open(transaction.receipt, "_blank", "noopener,noreferrer")} aria-label={`View receipt for ${transaction.name}`}>Receipt</button>}
                    {transaction.id && <button type="button" onClick={() => openEditExpense(transaction)} aria-label={`Edit ${transaction.name}`}>Edit</button>}
                    {transaction.id && <button type="button" onClick={() => void deleteExpense(transaction)} aria-label={`Delete ${transaction.name}`}>Delete</button>}
                  </span>
                </div>
              ))}
            </div>
          </article>}

          {activeNav === "History" && <section className="panel history-panel">
            <div className="panel-head">
              <div>
                <p className="eyebrow">Complete activity</p>
                <h2>History</h2>
                <p>Every recorded money movement and financial record change, kept in one timeline.</p>
              </div>
              <strong className="history-count">{filteredHistoryActivities.length} of {historyActivities.length} records</strong>
            </div>
            <div className="history-tools">
              <label className="transaction-search">
                <Icon name="search" size={16} />
                <input type="search" value={historySearch} onChange={(event) => setHistorySearch(event.target.value)} placeholder="Search all activity..." aria-label="Search history" />
              </label>
              <label className="category-filter">
                <span>Type</span>
                <select value={historyKind} onChange={(event) => setHistoryKind(event.target.value)} aria-label="Filter history by type">
                  {["All activity", "Income", "Expense", "Transfer", "Loan", "Repayment", "Goal contribution", "Savings goal", "Recurring schedule", "Opening balance", "Reconciliation", "Budget"].map((kind) => <option key={kind}>{kind}</option>)}
                </select>
              </label>
              <label className="category-filter">
                <span>Date</span>
                <select value={historyDateFilter} onChange={(event) => setHistoryDateFilter(event.target.value as typeof historyDateFilter)} aria-label="Filter history by date">
                  {["All time", "This month", "This year", "Custom"].map((range) => <option key={range}>{range}</option>)}
                </select>
              </label>
              {historyDateFilter === "Custom" && (
                <div className="history-custom-dates">
                  <label>From<input type="date" value={historyStartDate} onChange={(event) => setHistoryStartDate(event.target.value)} /></label>
                  <label>To<input type="date" value={historyEndDate} onChange={(event) => setHistoryEndDate(event.target.value)} /></label>
                </div>
              )}
              {(historySearch || historyKind !== "All activity" || historyDateFilter !== "All time" || historyStartDate || historyEndDate) && <button type="button" className="clear-filters-button" onClick={() => {
                setHistorySearch("");
                setHistoryKind("All activity");
                setHistoryDateFilter("All time");
                setHistoryStartDate("");
                setHistoryEndDate("");
              }}>Clear filters</button>}
            </div>
            {historyStartKey && historyEndKey && historyStartKey > historyEndKey && <p className="history-filter-error" role="alert">The start date must be on or before the end date.</p>}
            {historyError && <p className="history-filter-error" role="alert">{historyError}</p>}
            {historyTotals && Object.keys(historyTotals).length > 0 && (
              <div className="history-totals" aria-label="Income and spending totals for filtered activity">
                {Object.entries(historyTotals).sort(([first], [second]) => first.localeCompare(second)).map(([currency, totals]) => (
                  <div className="history-total-card" key={currency}>
                    <span>{currency} · {totals.incomeCount} income / {totals.expenseCount} expenses</span>
                    <div><small>Income</small><strong className="cashflow-positive">{formatMoney(totals.income, currency)}</strong></div>
                    <div><small>Spending</small><strong className="cashflow-negative">{formatMoney(totals.spending, currency)}</strong></div>
                    <div><small>Net</small><strong className={totals.income - totals.spending >= 0 ? "cashflow-positive" : "cashflow-negative"}>{formatMoney(totals.income - totals.spending, currency)}</strong></div>
                  </div>
                ))}
              </div>
            )}
            <div className="history-list">
              {loadingHistory ? (
                <div className="history-empty" role="status"><span><Icon name="history" /></span><div><strong>Loading activity history…</strong><p>Your saved financial activity will appear here.</p></div></div>
              ) : filteredHistoryActivities.length === 0 ? (
                <div className="history-empty" role="status">
                  <span><Icon name="history" /></span>
                  <div>
                    <strong>{historyActivities.length === 0 ? "No money activity recorded yet" : "No activity matches these filters"}</strong>
                    <p>{historyActivities.length === 0 ? "Income, expenses, transfers, repayments, and financial changes will appear here." : "Try another search, type, or date range."}</p>
                  </div>
                </div>
              ) : filteredHistoryActivities.map((activity) => {
                const parsedDate = activity.date ? parseExpenseDate(activity.date) : null;
                const dateLabel = parsedDate
                  ? parsedDate.toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })
                  : "Date unavailable";
                const kindClass = activity.kind.toLowerCase().replace(/\s+/g, "-");
                return (
                  <article className={`history-row ${activity.flow}`} key={activity.id}>
                    <span className={`history-kind-icon ${kindClass}`}>
                      <Icon name={activity.flow === "transfer" ? "wallet" : activity.flow === "in" ? "arrowDown" : "arrowUp"} size={18} />
                    </span>
                    <div className="history-description">
                      <strong>{activity.title}</strong>
                      <small>{activity.action === "recorded" ? activity.kind : `${activity.kind} ${activity.action}`}{activity.detail ? ` · ${activity.detail}` : ""}</small>
                    </div>
                    <time className="history-date" dateTime={activity.date || undefined}>{dateLabel}</time>
                    <strong className="history-amount">
                      {activity.action === "recorded"
                        ? <>{activity.flow === "in" ? "+" : activity.flow === "out" ? "−" : ""}{formatMoney(activity.amount, activity.currency)}</>
                        : activity.action}
                    </strong>
                  </article>
                );
              })}
            </div>
          </section>}
        </section>
      </main>

      <nav className="mobile-nav" aria-label="Mobile navigation">
        {mobileNavItems.map((item) => (
          <button type="button" className={activeNav === item.label ? "active" : ""} onClick={() => handleNavClick(item.label)} key={item.label} aria-current={activeNav === item.label ? "page" : undefined}>
            <Icon name={item.icon} /><span>{item.label}</span>
          </button>
        ))}
      </nav>

      {undoNotice && <div className="undo-toast" role="status" aria-live="polite">
        <span>{undoNotice.message}</span>
        <button type="button" onClick={() => void undoLastAction()}>Undo</button>
        <button type="button" className="undo-toast-dismiss" onClick={() => { if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current); setUndoNotice(null); }} aria-label="Dismiss undo message">×</button>
      </div>}

      {showModal && (
        <div className="modal-backdrop" onMouseDown={() => setShowModal(false)}>
          <section className={`modal${modalMode === "import" ? " csv-import-modal" : ""}`} role="dialog" aria-modal="true" aria-labelledby="modal-title" onMouseDown={(event) => event.stopPropagation()}>
            <button type="button" className="modal-close" onClick={() => setShowModal(false)} aria-label="Close dialog"><Icon name="close" /></button>
            {modalMode === "tracker" ? (
              <>
                <p className="eyebrow">Keep budgets separate</p>
                <h2 id="modal-title">Create a budget tracker</h2>
                <p>Each tracker has its own budget, transactions, accounts, categories, and goals.</p>
                <form className="modal-form" onSubmit={(event) => void createTracker(event)}>
                  <label>Tracker name<input required maxLength={100} autoFocus value={newTrackerName} onChange={(event) => setNewTrackerName(event.target.value)} placeholder="e.g. Japan trip or Monthly expenses" /></label>
                  <label>What are you tracking?
                    <select value={newTrackerContext} onChange={(event) => setNewTrackerContext(event.target.value)}>
                      <option value="Everyday">Everyday / monthly expenses</option>
                      <option value="Daily">Daily spending</option>
                      <option value="Local trip">Local trip</option>
                      <option value="Foreign trip">Foreign trip</option>
                      <option value="Everything">Everything</option>
                    </select>
                  </label>
                  <div className="form-row">
                    <label>Main currency<select value={newTrackerCurrency} onChange={(event) => setNewTrackerCurrency(event.target.value)}>{currencies.map((item) => <option value={item.code} key={item.code}>{item.code} · {item.name}</option>)}</select></label>
                    <label>{newTrackerContext === "Foreign trip" ? "Destination country" : "Place (optional)"}<input maxLength={100} value={newTrackerDestination} onChange={(event) => setNewTrackerDestination(event.target.value)} placeholder={newTrackerContext === "Foreign trip" ? "e.g. Japan" : "Optional"} /></label>
                  </div>
                  <label>Starting budget (optional)<input type="number" min="0" step="0.01" value={newTrackerBudget} onChange={(event) => setNewTrackerBudget(event.target.value)} placeholder={`e.g. ${formatMoney(1000, newTrackerCurrency)}`} /></label>
                  {trackerFormError && <p className="form-error" role="alert">{trackerFormError}</p>}
                  <button className="primary-button modal-submit" type="submit" disabled={creatingTracker || loadingTracker}>{creatingTracker || loadingTracker ? "Creating tracker..." : "Create tracker"}</button>
                </form>
              </>
            ) : modalMode === "budget" ? (
              <>
                <p className="eyebrow">Start from zero</p>
                <h2 id="modal-title">{budgetMode === "increase" ? "Add to your budget" : "Set your budget"}</h2>
                <p>{budgetMode === "increase" ? `Current budget: ${formatMoney(budget, tracker.currency)}. Enter the extra amount to add.` : "Set the total amount for this budget."}</p>
                <form className="modal-form" onSubmit={handleBudgetSubmit}>
                  {budget > 0 && (
                    <div className="budget-mode-switch" aria-label="Budget update mode">
                      <button type="button" className={budgetMode === "increase" ? "selected" : ""} onClick={() => { setBudgetMode("increase"); setBudgetInput(""); }}>Add amount</button>
                      <button type="button" className={budgetMode === "set-total" ? "selected" : ""} onClick={() => { setBudgetMode("set-total"); setBudgetInput(String(budget)); }}>Set total</button>
                    </div>
                  )}
                  <label>{budgetMode === "increase" ? "Additional budget" : "Total budget"}<input required min="0.01" step="0.01" autoFocus type="number" value={budgetInput} onChange={(event) => setBudgetInput(event.target.value)} placeholder={formatMoney(0, tracker.currency)} /></label>
                  {budgetMode === "increase" && budgetInput && Number(budgetInput) > 0 && (
                    <p className="budget-preview">New budget total: <strong>{formatMoney(budget + Number(budgetInput), tracker.currency)}</strong></p>
                  )}
                  <label>Budget currency<select value={tracker.currency} onChange={(event) => setTracker({ ...tracker, currency: event.target.value })}>{currencies.map((item) => <option value={item.code} key={item.code}>{item.code} · {item.name}</option>)}</select></label>
                  {budgetError && <p className="form-error" role="alert">{budgetError}</p>}
                  <button className="primary-button modal-submit" type="submit" disabled={savingBudget}>{savingBudget ? "Saving..." : budgetMode === "increase" ? "Add to budget" : "Save total budget"}</button>
                </form>
              </>
            ) : modalMode === "expense" ? (
              <>
                <p className="eyebrow">{editingExpenseId ? "Update activity" : "New activity"}</p>
                <h2 id="modal-title">{editingExpenseId ? "Edit expense" : "Add an expense"}</h2>
                <p>Keep your spending picture up to date.</p>
                <form className="modal-form" onSubmit={async (event) => {
                  event.preventDefault();
                  if (!expenseName.trim() || !expenseAmount) return;
                  await saveExpense();
                }}>
                  <label>Expense name<input required autoFocus value={expenseName} onChange={(event) => setExpenseName(event.target.value)} placeholder="e.g. Dinner in Lisbon" /></label>
                  <div className="form-row">
                    <label>Amount<input required min="0.01" step="0.01" type="number" value={expenseAmount} onChange={(event) => setExpenseAmount(event.target.value)} placeholder={formatMoney(0, expenseCurrency)} /></label>
                    <label>Category<select value={expenseCategory} onChange={(event) => setExpenseCategory(event.target.value)}>{[...new Set(["Groceries", "Dining out", "Transport", "Bills & utilities", "Lifestyle", ...customCategories.filter((category) => category.kind === "expense").map((category) => category.name)])].map((category) => <option key={category}>{category}</option>)}</select></label>
                  </div>
                  <label>Expense date<input required type="date" value={expenseDate} onChange={(event) => setExpenseDate(event.target.value)} /></label>
                  <details className="expense-more-options">
                    <summary>More details · account, tags, receipt</summary>
                    <div className="form-row">
                      <label>Paid in<select value={expenseCurrency} onChange={(event) => setExpenseCurrency(event.target.value)}>{currencies.map((item) => <option value={item.code} key={item.code}>{item.code} · {item.symbol}</option>)}</select></label>
                      <label>Account<select value={expenseAccount} onChange={(event) => setExpenseAccount(event.target.value)}><option value="">Unassigned</option>{financeAccounts.map((account) => <option value={account.id} key={account.id}>{account.name}</option>)}</select></label>
                    </div>
                    <label>Tags (comma separated)<input maxLength={300} value={expenseTagsInput} onChange={(event) => setExpenseTagsInput(event.target.value)} placeholder="work, travel, reimbursable" /></label>
                    <label>Receipt image<input type="file" accept="image/jpeg,image/png,image/webp" onChange={async (event) => {
                      const file = event.target.files?.[0];
                      event.target.value = "";
                      if (!file) return;
                      try {
                        setExpenseReceipt(await fileToReceipt(file));
                      } catch (error) {
                        setExpenseError(error instanceof Error ? error.message : "Unable to process this receipt.");
                      }
                    }} /></label>
                  </details>
                  {expenseReceipt && <div className="receipt-preview"><img src={expenseReceipt} alt="Receipt preview" /><button type="button" onClick={() => setExpenseReceipt("")}>Remove receipt</button></div>}
                  {expenseError && <p className="form-error" role="alert">{expenseError}</p>}
                  <button className="primary-button modal-submit" type="submit" disabled={savingExpense}>{savingExpense ? "Saving..." : editingExpenseId ? "Save changes" : "Save expense"}</button>
                </form>
              </>
            ) : modalMode === "income" ? (
              <>
                <p className="eyebrow">Add to your cash flow</p>
                <h2 id="modal-title">Record income</h2>
                <p>Keep your earnings alongside your spending.</p>
                <form className="modal-form" onSubmit={saveIncome}>
                  <label>Source<input required autoFocus maxLength={100} value={incomeName} onChange={(event) => setIncomeName(event.target.value)} placeholder="Salary, freelance..." /></label>
                  <div className="form-row">
                    <label>Amount<input required min="0.01" step="0.01" type="number" value={incomeAmount} onChange={(event) => setIncomeAmount(event.target.value)} placeholder={formatMoney(0, incomeCurrency)} /></label>
                    <label>Date<input required type="date" value={incomeDate} onChange={(event) => setIncomeDate(event.target.value)} /></label>
                  </div>
                  <div className="form-row">
                    <label>Category<select value={incomeCategory} onChange={(event) => setIncomeCategory(event.target.value)}>{["Salary", "Freelance", "Investment", ...customCategories.filter((category) => category.kind === "income").map((category) => category.name)].map((category) => <option key={category}>{category}</option>)}</select></label>
                    <label>Currency<select value={incomeCurrency} onChange={(event) => setIncomeCurrency(event.target.value)}>{currencies.map((item) => <option value={item.code} key={item.code}>{item.code} · {item.symbol}</option>)}</select></label>
                  </div>
                  <label>Deposit to<select value={incomeAccount} onChange={(event) => setIncomeAccount(event.target.value)}><option value="">Unassigned</option>{financeAccounts.map((account) => <option value={account.id} key={account.id}>{account.name}</option>)}</select></label>
                  {financeError && <p className="form-error" role="alert">{financeError}</p>}
                  <button className="primary-button modal-submit" type="submit" disabled={savingFinance}>{savingFinance ? "Saving..." : "Record income"}</button>
                </form>
              </>
            ) : modalMode === "goal" ? (
              <>
                <p className="eyebrow">Make room for what matters</p>
                <h2 id="modal-title">Create a savings goal</h2>
                <p>Choose a target and build toward it at your own pace.</p>
                <form className="modal-form" onSubmit={saveGoal}>
                  <label>Goal name<input required autoFocus maxLength={100} value={goalName} onChange={(event) => setGoalName(event.target.value)} placeholder="Emergency fund, holiday..." /></label>
                  <div className="form-row">
                    <label>Target amount<input required min="0.01" step="0.01" type="number" value={goalTarget} onChange={(event) => setGoalTarget(event.target.value)} placeholder={formatMoney(0, tracker.currency)} /></label>
                    <label>Target date (optional)<input type="date" value={goalDate} onChange={(event) => setGoalDate(event.target.value)} /></label>
                  </div>
                  <p className="form-hint">Goal currency: {tracker.currency}. You can add contributions from Goals.</p>
                  {financeError && <p className="form-error" role="alert">{financeError}</p>}
                  <button className="primary-button modal-submit" type="submit" disabled={savingFinance}>{savingFinance ? "Saving..." : "Create goal"}</button>
                </form>
              </>
            ) : modalMode === "transaction-detail" ? (
              selectedTransaction && <>
                <p className="eyebrow">Transaction details</p>
                <h2 id="modal-title">{selectedTransaction.name}</h2>
                <p className="transaction-detail-amount">−{formatMoney(selectedTransaction.amount, selectedTransaction.currency)}</p>
                <dl className="transaction-detail-list">
                  <div><dt>Category</dt><dd>{selectedTransaction.category}</dd></div>
                  <div><dt>Date</dt><dd>{selectedTransaction.date}</dd></div>
                  <div><dt>Account</dt><dd>{selectedTransaction.accountId ? financeAccounts.find((account) => account.id === selectedTransaction.accountId)?.name ?? "Account" : "Unassigned"}</dd></div>
                  <div><dt>Tags</dt><dd>{selectedTransaction.tags?.length ? selectedTransaction.tags.join(", ") : "None"}</dd></div>
                </dl>
                {selectedTransaction.receipt && <div className="receipt-preview"><img src={selectedTransaction.receipt} alt={`Receipt for ${selectedTransaction.name}`} /></div>}
                <div className="transaction-detail-actions">
                  {selectedTransaction.receipt && <button type="button" className="text-button" onClick={() => window.open(selectedTransaction.receipt, "_blank", "noopener,noreferrer")}>Open receipt</button>}
                  <button type="button" className="primary-button" onClick={() => openEditExpense(selectedTransaction)}>Edit transaction</button>
                </div>
              </>
            ) : modalMode === "import" ? (
              <>
                <p className="eyebrow">Bring your history with you</p>
                <h2 id="modal-title">Import expenses from CSV</h2>
                <p>Choose a bank statement or a Hearthy CSV export. Required columns: date, amount, and name (or description, merchant, or payee).</p>
                <div className="csv-import-content">
                  <label className="csv-file-picker">Choose CSV file<input type="file" accept=".csv,text/csv" onChange={(event) => void previewCsvFile(event)} /></label>
                  <small>Up to 500 expenses and 5 MB per file. Income rows in a Hearthy export are skipped.</small>
                  {csvPreviewRows.length > 0 && (
                    <>
                      <div className="csv-preview-summary" role="status">
                        <strong>{csvPreviewRows.filter((row) => row.selected).length} selected</strong>
                        <span>{csvPreviewRows.filter((row) => row.duplicate).length} possible duplicates · {csvPreviewRows.filter((row) => row.error).length} invalid rows{csvIgnoredRows ? ` · ${csvIgnoredRows} non-expense rows` : ""}</span>
                        <button type="button" className="text-button" onClick={() => setCsvPreviewRows((current) => current.map((row) => ({ ...row, selected: Boolean(row.expense && !row.duplicate) })))}>Select valid, non-duplicates</button>
                      </div>
                      <div className="csv-preview-list" role="list" aria-label="CSV import preview">
                        {csvPreviewRows.map((row) => (
                          <label className={`csv-preview-row${row.error ? " invalid" : row.duplicate ? " duplicate" : ""}`} key={row.lineNumber} role="listitem">
                            <input type="checkbox" checked={row.selected} disabled={!row.expense || savingCsvImport} onChange={(event) => setCsvPreviewRows((current) => current.map((item) => item.lineNumber === row.lineNumber ? { ...item, selected: event.target.checked } : item))} />
                            <span className="csv-preview-line">#{row.lineNumber}</span>
                            <span className="csv-preview-name">{row.expense?.name ?? row.error}</span>
                            <span className="csv-preview-amount">{row.expense ? formatMoney(row.expense.amount, row.expense.currency) : ""}</span>
                            <span className="csv-preview-state">{row.error ? "Invalid" : row.duplicate ? "Possible duplicate" : row.expense?.date.slice(0, 10)}</span>
                          </label>
                        ))}
                      </div>
                    </>
                  )}
                  {csvImportError && <p className="form-error" role="alert">{csvImportError}</p>}
                  <button className="primary-button modal-submit" type="button" onClick={() => void importCsvExpenses()} disabled={savingCsvImport || !csvPreviewRows.some((row) => row.selected)}>{savingCsvImport ? "Importing..." : `Import ${csvPreviewRows.filter((row) => row.selected).length} expenses`}</button>
                </div>
              </>
            ) : (
              <>
                <p className="eyebrow">{moneyRecordId ? "Update a money record" : "Keep track of a repayment"}</p>
                <h2 id="modal-title">{moneyRecordId ? "Edit money record" : "Lent or borrowed?"}</h2>
                <p>Record who, how much, and when the money should be returned.</p>
                <form className="modal-form" onSubmit={async (event) => {
                  event.preventDefault();
                  await saveMoneyRecord();
                }}>
                  <div className="budget-mode-switch" aria-label="Money direction">
                    <button type="button" className={moneyDirection === "borrowed" ? "selected" : ""} onClick={() => setMoneyDirection("borrowed")}>I borrowed</button>
                    <button type="button" className={moneyDirection === "lent" ? "selected" : ""} onClick={() => setMoneyDirection("lent")}>I lent</button>
                  </div>
                  <label>{moneyDirection === "borrowed" ? "Borrowed from" : "Lent to"}<input required autoFocus maxLength={80} value={moneyPerson} onChange={(event) => setMoneyPerson(event.target.value)} placeholder="Person’s name" /></label>
                  <div className="form-row">
                    <label>Amount<input required min="0.01" step="0.01" type="number" value={moneyAmount} onChange={(event) => setMoneyAmount(event.target.value)} placeholder={formatMoney(0, moneyCurrency)} /></label>
                    <label>Currency<select value={moneyCurrency} onChange={(event) => setMoneyCurrency(event.target.value)}>{currencies.map((item) => <option value={item.code} key={item.code}>{item.code} · {item.symbol}</option>)}</select></label>
                  </div>
                  <label>Expected return date<input required type="date" value={moneyDueDate} onChange={(event) => setMoneyDueDate(event.target.value)} /></label>
                  <label>Note (optional)<input maxLength={240} value={moneyNote} onChange={(event) => setMoneyNote(event.target.value)} placeholder="What was the money for?" /></label>
                  {moneyError && <p className="form-error" role="alert">{moneyError}</p>}
                  <button className="primary-button modal-submit" type="submit" disabled={savingMoneyRecord}>{savingMoneyRecord ? "Saving..." : moneyRecordId ? "Save changes" : "Save money record"}</button>
                </form>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
