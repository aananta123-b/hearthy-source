import { useEffect, useRef, useState, type ReactNode } from "react";

type IconName =
  | "home"
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
};

type TrackerConfig = {
  id?: string;
  userId?: string;
  name: string;
  currency: string;
  context: string;
  destination: string;
  budget?: number;
};

type User = {
  id: string;
  name: string;
  email: string;
  createdAt?: string;
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

const API_BASE = "http://localhost:3001/api";
const USER_STORAGE_KEY = "hearthy-user";

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });

  let payload: any = null;
  try {
    payload = await response.json();
  } catch {
    payload = {};
  }

  if (!response.ok) {
    throw new Error(payload?.error || "Request failed.");
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
  };
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

function AuthPage({
  mode,
  setMode,
  onSubmit,
  loading,
  error,
}: {
  mode: "login" | "signup";
  setMode: (mode: "login" | "signup") => void;
  onSubmit: (payload: { name?: string; email: string; password: string }) => Promise<void> | void;
  loading: boolean;
  error?: string;
}) {
  const isSignup = mode === "signup";
  const [name, setName] = useState("Alex Morgan");
  const [email, setEmail] = useState("alex@example.com");
  const [password, setPassword] = useState("password123");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onSubmit({ name: isSignup ? name : undefined, email, password });
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
            <p className="eyebrow">{isSignup ? "Start your journey" : "Welcome back"}</p>
            <h2>{isSignup ? "Create your account" : "Sign in to Hearthy"}</h2>
            <p>{isSignup ? "Build better money habits, one day at a time." : "Your financial home is right where you left it."}</p>
          </div>

          <div className="auth-tabs" role="tablist" aria-label="Account access">
            <button type="button" role="tab" aria-selected={!isSignup} className={!isSignup ? "active" : ""} onClick={() => setMode("login")}>Log in</button>
            <button type="button" role="tab" aria-selected={isSignup} className={isSignup ? "active" : ""} onClick={() => setMode("signup")}>Sign up</button>
          </div>

          <form key={`form-${mode}`} className="auth-form" onSubmit={handleSubmit}>
            {isSignup && (
              <label>
                Full name
                <input required autoComplete="name" placeholder="Alex Morgan" value={name} onChange={(event) => setName(event.target.value)} />
              </label>
            )}
            <label>
              Email address
              <input required type="email" autoComplete="email" placeholder="alex@example.com" value={email} onChange={(event) => setEmail(event.target.value)} />
            </label>
            <label>
              <span className="label-row">Password {!isSignup && <b>Forgot?</b>}</span>
              <input required type="password" autoComplete={isSignup ? "new-password" : "current-password"} placeholder="••••••••" value={password} onChange={(event) => setPassword(event.target.value)} />
            </label>
            {error && <div className="auth-error">{error}</div>}
            <button className="primary-button auth-submit" type="submit" disabled={loading}>{loading ? "Please wait..." : isSignup ? "Create account" : "Log in"}</button>
          </form>
        </div>
      </section>
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
  const [activeNav, setActiveNav] = useState("Overview");
  const [transactionSearch, setTransactionSearch] = useState("");
  const [transactionCategory, setTransactionCategory] = useState("All categories");
  const transactionsRef = useRef<HTMLElement>(null);
  const [period, setPeriod] = useState<"This week" | "This month" | "This year">("This month");
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState<"budget" | "expense">("expense");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [showSetup, setShowSetup] = useState(false);
  const [user, setUser] = useState<User | null>(() => {
    try {
      const stored = localStorage.getItem(USER_STORAGE_KEY);
      return stored ? (JSON.parse(stored) as User) : null;
    } catch {
      return null;
    }
  });
  const [budget, setBudget] = useState(11579);
  const [userTransactions, setUserTransactions] = useState<ExpenseTransaction[]>(demoTransactions);
  const [isDemoAccount, setIsDemoAccount] = useState(true);
  const [budgetInput, setBudgetInput] = useState("");
  const [expenseName, setExpenseName] = useState("");
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseDate, setExpenseDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [expenseError, setExpenseError] = useState("");
  const [savingExpense, setSavingExpense] = useState(false);
  const [expenseCategory, setExpenseCategory] = useState("Groceries");
  const [expenseCurrency, setExpenseCurrency] = useState("USD");
  const [authError, setAuthError] = useState("");
  const [loadingAuth, setLoadingAuth] = useState(false);
  const [tracker, setTracker] = useState<TrackerConfig>({
    name: "My everyday expenses",
    currency: "USD",
    context: "Everything",
    destination: "",
  });

  useEffect(() => {
    if (user) {
      localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(USER_STORAGE_KEY);
    }
  }, [user]);

  useEffect(() => {
    if (!user) {
      return;
    }

    const syncUserAccount = async () => {
      try {
        const response = await apiFetch<{ trackers: TrackerConfig[] }>(`/users/${user.id}/trackers`);
        const tracked = response.trackers[0];

        if (tracked) {
          setTracker(tracked);
          setBudget(tracked.budget ?? 0);
          setExpenseCurrency(tracked.currency);
          const expensesResponse = await apiFetch<{ expenses: any[] }>(`/trackers/${tracked.id}/expenses`);
          setUserTransactions(expensesResponse.expenses.map(mapExpenseToTransaction));
          setIsDemoAccount(false);
          setIsAuthenticated(true);
        }
      } catch {
        setIsAuthenticated(true);
      }
    };

    void syncUserAccount();
  }, [user]);

  const navItems: { label: string; icon: IconName }[] = [
    { label: "Overview", icon: "home" },
    { label: "Transactions", icon: "wallet" },
    { label: "Analytics", icon: "chart" },
    { label: "Goals", icon: "target" },
  ];

  const periodTransactions = userTransactions.filter((transaction) => {
    const parsedDate = parseExpenseDate(transaction.dateISO ?? transaction.date);
    return parsedDate ? isWithinPeriod(parsedDate, period) : false;
  });
  const periodTotalSpent = periodTransactions.reduce((total, transaction) => total + transaction.amount, 0);
  const averageSpend = periodTransactions.length > 0 ? periodTotalSpent / periodTransactions.length : 0;
  const largestCategory = periodTransactions.reduce<Record<string, number>>((totals, transaction) => {
    totals[transaction.category] = (totals[transaction.category] ?? 0) + transaction.amount;
    return totals;
  }, {});
  const topCategory = Object.entries(largestCategory).sort((a, b) => b[1] - a[1])[0];

  const previousPeriodTotal = userTransactions
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
    const matchesSearch = !query || [transaction.name, transaction.category, transaction.date, transaction.currency]
      .some((value) => value.toLowerCase().includes(query));
    const matchesCategory = transactionCategory === "All categories" || transaction.category === transactionCategory;
    return matchesSearch && matchesCategory;
  });

  const totalSpent = userTransactions.reduce((total, transaction) => total + transaction.amount, 0);
  const availableBalance = Math.max(budget - totalSpent, 0);
  const budgetUsed = budget > 0 ? Math.min((totalSpent / budget) * 100, 100) : 0;
  const displayCategories = categories.map((category) => {
    if (isDemoAccount) return category;
    const matchingNames: Record<string, string[]> = {
      Housing: ["Bills & utilities"],
      "Food & dining": ["Groceries", "Dining out"],
      Transport: ["Transport"],
      Lifestyle: ["Lifestyle"],
    };
    const value = userTransactions
      .filter((transaction) => matchingNames[category.name]?.includes(transaction.category))
      .reduce((sum, transaction) => sum + transaction.amount, 0);
    return { ...category, value, percent: budget > 0 ? Math.min((value / budget) * 100, 100) : 0 };
  });

  function openBudget() {
    setBudgetInput(budget > 0 ? String(budget) : "");
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
    setEditingExpenseId(null);
    setExpenseError("");
    setModalMode("expense");
    setShowModal(true);
  }

  function handleNavClick(label: string) {
    setActiveNav(label);
    if (label === "Transactions") {
      transactionsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    } else if (label === "Analytics") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  function exportTransactions() {
    if (filteredTransactions.length === 0) return;

    const protectSpreadsheetCell = (value: string | number) => {
      const text = String(value);
      const safeText = /^[\t\r ]*[=+\-@]/.test(text) ? `'${text}` : text;
      return `"${safeText.replace(/"/g, '""')}"`;
    };
    const rows = [
      ["Name", "Category", "Date", "Amount", "Currency"],
      ...filteredTransactions.map((transaction) => [
        transaction.name,
        transaction.category,
        transaction.dateISO ?? transaction.date,
        transaction.amount,
        transaction.currency,
      ]),
    ];
    const csv = rows.map((row) => row.map(protectSpreadsheetCell).join(",")).join("\r\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `hearthy-expenses-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function openEditExpense(transaction: ExpenseTransaction) {
    setExpenseName(transaction.name);
    setExpenseAmount(String(transaction.amount));
    setExpenseCategory(transaction.category);
    setExpenseCurrency(transaction.currency);
    setExpenseDate((transaction.dateISO ?? parseExpenseDate(transaction.date)?.toISOString() ?? new Date().toISOString()).slice(0, 10));
    setEditingExpenseId(transaction.id ?? null);
    setExpenseError("");
    setModalMode("expense");
    setShowModal(true);
  }

  async function handleAuthSubmit(payload: { name?: string; email: string; password: string }) {
    setLoadingAuth(true);
    setAuthError("");

    try {
      if (authMode === "signup") {
        const result = await apiFetch<{ user: User }>('/auth/signup', {
          method: 'POST',
          body: JSON.stringify({
            name: payload.name,
            email: payload.email,
            password: payload.password,
          }),
        });
        setUser(result.user);
        setIsAuthenticated(true);
        setShowSetup(true);
      } else {
        const result = await apiFetch<{ user: User }>('/auth/login', {
          method: 'POST',
          body: JSON.stringify({
            email: payload.email,
            password: payload.password,
          }),
        });
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
      setTracker(nextTracker);
      setBudget(nextTracker.budget ?? 0);
      setUserTransactions([]);
      setExpenseCurrency(nextTracker.currency);
      setIsDemoAccount(false);
      setShowSetup(false);
      setIsAuthenticated(true);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Unable to create tracker.');
    }
  }

  async function saveBudget(nextBudget: number) {
    if (!tracker.id) {
      setBudget(nextBudget);
      return;
    }

    await apiFetch<{ tracker: TrackerConfig }>(`/trackers/${tracker.id}/budget`, {
      method: 'PUT',
      body: JSON.stringify({ budget: nextBudget }),
    });
    setBudget(nextBudget);
    setTracker((current) => ({ ...current, budget: nextBudget }));
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
    } catch (error) {
      setExpenseError(error instanceof Error ? error.message : "Unable to save this expense.");
    } finally {
      setSavingExpense(false);
    }
  }

  async function deleteExpense(transaction: ExpenseTransaction) {
    if (!tracker.id || !transaction.id) return;
    if (!window.confirm(`Delete "${transaction.name}"? This cannot be undone.`)) return;

    try {
      await apiFetch<void>(`/trackers/${tracker.id}/expenses/${transaction.id}`, { method: "DELETE" });
      setUserTransactions((current) => current.filter((item) => item.id !== transaction.id));
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Unable to delete this expense.");
    }
  }

  if (showSetup) {
    return <TrackerSetup onBack={() => { setShowSetup(false); setAuthMode("login"); setIsAuthenticated(false); setUser(null); }} onComplete={handleSetupComplete} />;
  }

  if (!isAuthenticated || !user) {
    return <AuthPage mode={authMode} setMode={setAuthMode} onSubmit={handleAuthSubmit} loading={loadingAuth} error={authError} />;
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
            >
              <Icon name={item.icon} />
              <span>{item.label}</span>
            </button>
          ))}
          <p className="nav-label nav-label-secondary">Manage</p>
          <button type="button" className="nav-item" onClick={() => setActiveNav("Settings")}>
            <Icon name="settings" />
            <span>Settings</span>
          </button>
        </nav>

        <div className="sidebar-tip">
          <div className="tip-art"><i /><i /><i /></div>
          <p>Weekly insight</p>
          <strong>You spent 12% less on dining this week.</strong>
          <button type="button">View insights <Icon name="chevron" size={15} /></button>
        </div>

        <div className="profile">
          <div className="avatar">AM</div>
          <div>
            <strong>{user.name}</strong>
            <span>{user.email}</span>
          </div>
          <button type="button" onClick={() => { setUser(null); setIsAuthenticated(false); setShowSetup(false); }}>EXIT</button>
        </div>
      </aside>

      <main>
        <header className="topbar">
          <div className="search">
            <Icon name="search" size={16} />
            <input type="search" aria-label="Search transactions" value={transactionSearch} onChange={(event) => setTransactionSearch(event.target.value)} placeholder="Search transactions" />
            <kbd>⌘K</kbd>
          </div>

          <div className="top-actions">
            <label className="currency-switch" title="Reporting currency">
              <span>{currencies.find((item) => item.code === tracker.currency)?.symbol}</span>
              <select value={tracker.currency} onChange={(event) => setTracker({ ...tracker, currency: event.target.value })} aria-label="Reporting currency">
                {currencies.map((item) => <option value={item.code} key={item.code}>{item.code}</option>)}
              </select>
            </label>
            <button type="button" className="icon-button" aria-label="Notifications"><Icon name="bell" /><span className="notification-dot" /></button>
            <button type="button" className="primary-button" onClick={openExpense}><Icon name="plus" size={18} /> {budget === 0 ? "Add your budget" : "Add expense"}</button>
          </div>
        </header>

        <section className="content">
          <div className="page-heading">
            <div>
              <p className="eyebrow">Monday, May 26 · {tracker.name}</p>
              <h1>Good morning, {user.name.split(" ")[0]}.</h1>
              <p>Here’s how your {tracker.context.toLowerCase()} spending is looking today{tracker.destination ? ` in ${tracker.destination}` : ""}.</p>
            </div>
            <div className="period-picker">
              {['This week', 'This month', 'This year'].map((item) => (
                <button type="button" className={period === item ? "selected" : ""} onClick={() => setPeriod(item as "This week" | "This month" | "This year")} key={item}>{item}</button>
              ))}
            </div>
          </div>

          <div className="analysis-strip">
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
              <strong>{Math.abs(periodVariance).toFixed(1)}%</strong>
              <small>{periodVariance >= 0 ? "Higher than last period" : "Lower than last period"}</small>
            </div>
          </div>

          <div className="summary-grid">
            <article className="balance-card">
              <div className="card-label"><span>Available balance</span><span className="status-pill">On track</span></div>
              <h2>{formatMoney(availableBalance, tracker.currency)}</h2>
              <p>{budget === 0 ? "Set a budget to begin tracking" : <><span className="trend-up"><Icon name="arrowUp" size={14} /> {Math.round(100 - budgetUsed)}%</span> of your budget remains</>}</p>
              <div className="balance-art" aria-hidden="true">
                <span /><span /><span /><span />
              </div>
            </article>

            <article className="stat-card">
              <div className="stat-icon income"><Icon name="arrowDown" /></div>
              <div className="stat-copy"><span>Budget</span><strong>{formatMoney(budget, tracker.currency)}</strong><small><button type="button" className="inline-action" onClick={openBudget}>{budget === 0 ? "Add your first budget" : "Edit budget"}</button></small></div>
            </article>

            <article className="stat-card">
              <div className="stat-icon expense"><Icon name="arrowUp" /></div>
              <div className="stat-copy"><span>Expenses</span><strong>{formatMoney(totalSpent, tracker.currency)}</strong><small>{budget > 0 ? `${budgetUsed.toFixed(1)}% of budget` : "No expenses yet"}</small></div>
            </article>
          </div>

          <div className="dashboard-grid">
            <article className="panel spending-panel">
              <div className="panel-head">
                <div><h2>Spending overview</h2><p>Your cash flow across the last 6 months</p></div>
                <button type="button" className="more-button" aria-label="More options">•••</button>
              </div>
              <div className="chart-metrics">
                <div><span>Total spending</span><strong>{formatMoney(totalSpent, tracker.currency)}</strong></div>
                <div className="legend"><i className="income-dot" /> Income <i className="spend-dot" /> Spending</div>
              </div>
              <div className="chart-wrap">
                <div className="axis-labels"><span>{formatMoney(8000, tracker.currency, true)}</span><span>{formatMoney(6000, tracker.currency, true)}</span><span>{formatMoney(4000, tracker.currency, true)}</span><span>{formatMoney(2000, tracker.currency, true)}</span><span>{formatMoney(0, tracker.currency, true)}</span></div>
                <svg viewBox="0 0 620 190" preserveAspectRatio="none" role="img" aria-label="Income and spending chart from December to May">
                  <defs>
                    <linearGradient id="area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#1f4d3c" stopOpacity=".16" /><stop offset="1" stopColor="#1f4d3c" stopOpacity="0" /></linearGradient>
                  </defs>
                  <g className="grid-lines"><path d="M0 10H620M0 52H620M0 94H620M0 136H620M0 178H620" /></g>
                  <path className="area" d="M0 102 C40 90 67 70 110 76 S182 122 230 102 S300 55 350 63 S430 93 470 69 S545 34 620 45 L620 178 L0 178Z" />
                  <path className="income-line" d="M0 102 C40 90 67 70 110 76 S182 122 230 102 S300 55 350 63 S430 93 470 69 S545 34 620 45" />
                  <path className="spend-line" d="M0 134 C45 128 65 110 110 118 S175 145 230 134 S305 105 350 115 S420 134 470 119 S552 94 620 105" />
                  <circle cx="620" cy="45" r="4" className="income-point" />
                  <circle cx="620" cy="105" r="4" className="spend-point" />
                </svg>
                <div className="month-labels"><span>Dec</span><span>Jan</span><span>Feb</span><span>Mar</span><span>Apr</span><span>May</span></div>
              </div>
            </article>

            <article className="panel budget-panel">
              <div className="panel-head">
                <div><h2>Budget by category</h2><p>May 1 – May 31</p></div>
                <button type="button" className="text-button">View all</button>
              </div>
              <div className="budget-total"><span><strong>{formatMoney(totalSpent, tracker.currency, true)}</strong> spent</span><span>of {formatMoney(budget, tracker.currency, true)}</span></div>
              <div className="total-track"><span style={{ width: `${budgetUsed}%` }} /></div>
              <div className="category-list">
                {displayCategories.map((category) => (
                  <div className="category" key={category.name}>
                    <div><span><i className={category.color} />{category.name}</span><strong>{formatMoney(category.value, tracker.currency, true)}</strong></div>
                    <div className="category-track"><span className={category.color} style={{ width: `${category.percent}%` }} /></div>
                  </div>
                ))}
              </div>
              <div className="budget-note"><span>✦</span><p><strong>{budget === 0 ? "Ready when you are." : "Nice work!"}</strong><br />{budget === 0 ? "Add your own budget to start tracking." : `${formatMoney(availableBalance, tracker.currency)} remains in your budget.`}</p></div>
            </article>
          </div>

          <article className="panel transactions-panel" ref={transactionsRef}>
            <div className="panel-head">
              <div><h2>Transactions</h2><p>{filteredTransactions.length} of {userTransactions.length} expenses</p></div>
              <button type="button" className="text-button" onClick={exportTransactions} disabled={filteredTransactions.length === 0}>Export CSV</button>
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
                  {[...new Set(userTransactions.map((transaction) => transaction.category))].sort().map((category) => <option key={category}>{category}</option>)}
                </select>
              </label>
            </div>
            <div className="transaction-list">
              {userTransactions.length === 0 ? (
                <div className="empty-transactions">
                  <span><Icon name="wallet" /></span>
                  <div><strong>No expenses yet</strong><p>{budget === 0 ? "Add your budget first, then record expenses as they happen." : "Your tracker is ready. Add your first expense when you spend."}</p></div>
                  <button type="button" className="primary-button" onClick={budget === 0 ? openBudget : openExpense}>{budget === 0 ? "Add budget" : "Add first expense"}</button>
                </div>
              ) : filteredTransactions.length === 0 ? (
                <div className="transaction-no-results" role="status">No expenses match these filters.</div>
              ) : filteredTransactions.map((transaction) => (
                <div className="transaction" key={transaction.id ?? transaction.name}>
                  <span className={`transaction-icon ${transaction.tone}`}><Icon name={transaction.icon} /></span>
                  <span className="transaction-name"><strong>{transaction.name}</strong><small>{transaction.date}</small></span>
                  <span className="transaction-category">{transaction.category}</span>
                  <strong className="transaction-amount">-{formatMoney(transaction.amount, transaction.currency)}</strong>
                  <span className="transaction-actions">
                    {transaction.id && <button type="button" onClick={() => openEditExpense(transaction)} aria-label={`Edit ${transaction.name}`}>Edit</button>}
                    {transaction.id && <button type="button" onClick={() => void deleteExpense(transaction)} aria-label={`Delete ${transaction.name}`}>Delete</button>}
                  </span>
                </div>
              ))}
            </div>
          </article>
        </section>
      </main>

      <nav className="mobile-nav" aria-label="Mobile navigation">
        {navItems.map((item) => (
          <button type="button" className={activeNav === item.label ? "active" : ""} onClick={() => handleNavClick(item.label)} key={item.label}>
            <Icon name={item.icon} /><span>{item.label}</span>
          </button>
        ))}
      </nav>

      {showModal && (
        <div className="modal-backdrop" onMouseDown={() => setShowModal(false)}>
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" onMouseDown={(event) => event.stopPropagation()}>
            <button type="button" className="modal-close" onClick={() => setShowModal(false)} aria-label="Close dialog"><Icon name="close" /></button>
            {modalMode === "budget" ? (
              <>
                <p className="eyebrow">Start from zero</p>
                <h2 id="modal-title">{budget === 0 ? "Add your budget" : "Update your budget"}</h2>
                <p>Choose the amount you want to work with. Nothing is pre-filled for new accounts.</p>
                <form className="modal-form" onSubmit={async (event) => {
                  event.preventDefault();
                  const nextBudget = Number(budgetInput);
                  if (Number.isFinite(nextBudget) && nextBudget >= 0) {
                    await saveBudget(nextBudget);
                    setShowModal(false);
                  }
                }}>
                  <label>Budget amount<input required min="0.01" step="0.01" autoFocus type="number" value={budgetInput} onChange={(event) => setBudgetInput(event.target.value)} placeholder={formatMoney(0, tracker.currency)} /></label>
                  <label>Budget currency<select value={tracker.currency} onChange={(event) => setTracker({ ...tracker, currency: event.target.value })}>{currencies.map((item) => <option value={item.code} key={item.code}>{item.code} · {item.name}</option>)}</select></label>
                  <button className="primary-button modal-submit" type="submit">Save budget</button>
                </form>
              </>
            ) : (
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
                    <label>Category<select value={expenseCategory} onChange={(event) => setExpenseCategory(event.target.value)}><option>Groceries</option><option>Dining out</option><option>Transport</option><option>Bills & utilities</option><option>Lifestyle</option></select></label>
                  </div>
                  <label>Expense date<input required type="date" value={expenseDate} onChange={(event) => setExpenseDate(event.target.value)} /></label>
                  <div className="form-row">
                    <label>Paid in<select value={expenseCurrency} onChange={(event) => setExpenseCurrency(event.target.value)}>{currencies.map((item) => <option value={item.code} key={item.code}>{item.code} · {item.symbol}</option>)}</select></label>
                    <label>Tracker<select defaultValue={tracker.name}><option>{tracker.name}</option></select></label>
                  </div>
                  {expenseError && <p className="form-error" role="alert">{expenseError}</p>}
                  <button className="primary-button modal-submit" type="submit" disabled={savingExpense}>{savingExpense ? "Saving..." : editingExpenseId ? "Save changes" : "Save expense"}</button>
                </form>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
