// ============================================================
// My-Mock — core storage & auth layer
// ------------------------------------------------------------
// This runs entirely client-side using localStorage for now.
// Every function here is written so that swapping in real
// Supabase calls later means replacing the INSIDE of these
// functions only — nothing that calls them needs to change.
// ============================================================

const DB_KEYS = {
  USERS: "mymock_users",
  SESSION: "mymock_session",
  PENDING_VERIFY: "mymock_pending_verify",
  ANSWERS: "mymock_answers",
  SESSIONS: "mymock_practice_sessions",
};

function readDB(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}
function writeDB(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

// ---------------- simple hashing (demo-grade, NOT production security) ----------------
// NOTE: This is a client-side demo substitute for real password hashing.
// A real deployment must hash passwords server-side (Supabase Auth does
// this correctly out of the box) — never ship this hash function as-is
// to a real backend.
async function hashPassword(password) {
  const enc = new TextEncoder().encode(password);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function genCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// ---------------- auth ----------------

const Auth = {
  async signup({ name, email, password }) {
    const users = readDB(DB_KEYS.USERS, {});
    const emailKey = email.trim().toLowerCase();
    if (users[emailKey]) throw new Error("An account with this email already exists.");

    const passwordHash = await hashPassword(password);
    const code = genCode();

    const pending = readDB(DB_KEYS.PENDING_VERIFY, {});
    pending[emailKey] = {
      name, email: emailKey, passwordHash, code,
      createdAt: Date.now(), expiresAt: Date.now() + 15 * 60 * 1000,
    };
    writeDB(DB_KEYS.PENDING_VERIFY, pending);

    await EmailService.sendVerificationCode(emailKey, name, code);
    return { emailKey };
  },

  async verify({ email, code }) {
    const emailKey = email.trim().toLowerCase();
    const pending = readDB(DB_KEYS.PENDING_VERIFY, {});
    const record = pending[emailKey];
    if (!record) throw new Error("No pending verification found for this email. Please sign up again.");
    if (Date.now() > record.expiresAt) throw new Error("This code has expired. Please request a new one.");
    if (record.code !== code.trim()) throw new Error("Incorrect verification code.");

    const users = readDB(DB_KEYS.USERS, {});
    users[emailKey] = {
      id: crypto.randomUUID(),
      name: record.name,
      email: emailKey,
      passwordHash: record.passwordHash,
      role: "student",
      createdAt: new Date().toISOString(),
      verified: true,
    };
    writeDB(DB_KEYS.USERS, users);

    delete pending[emailKey];
    writeDB(DB_KEYS.PENDING_VERIFY, pending);

    // Log verified student to Google Sheet (see js/email.js for setup)
    SheetService.logVerifiedUser(users[emailKey]).catch(() => {
      // Fail soft — sheet logging must never block account creation.
      console.warn("Could not log user to Google Sheet (check Apps Script URL configuration).");
    });

    return users[emailKey];
  },

  async resendCode(email) {
    const emailKey = email.trim().toLowerCase();
    const pending = readDB(DB_KEYS.PENDING_VERIFY, {});
    const record = pending[emailKey];
    if (!record) throw new Error("No pending verification found. Please sign up again.");
    const code = genCode();
    record.code = code;
    record.expiresAt = Date.now() + 15 * 60 * 1000;
    pending[emailKey] = record;
    writeDB(DB_KEYS.PENDING_VERIFY, pending);
    await EmailService.sendVerificationCode(emailKey, record.name, code);
  },

  async login({ email, password }) {
    const emailKey = email.trim().toLowerCase();
    const users = readDB(DB_KEYS.USERS, {});
    const user = users[emailKey];
    if (!user) throw new Error("No account found with this email.");
    const hash = await hashPassword(password);
    if (hash !== user.passwordHash) throw new Error("Incorrect password.");

    const session = { userId: user.id, email: user.email, loginAt: Date.now() };
    writeDB(DB_KEYS.SESSION, session);
    return user;
  },

  logout() {
    localStorage.removeItem(DB_KEYS.SESSION);
  },

  currentUser() {
    const session = readDB(DB_KEYS.SESSION, null);
    if (!session) return null;
    const users = readDB(DB_KEYS.USERS, {});
    return users[session.email] || null;
  },

  requireLogin() {
    const user = this.currentUser();
    if (!user) {
      window.location.href = "login.html";
      return null;
    }
    return user;
  },
};

// ---------------- practice data ----------------

const PracticeStore = {
  saveAnswer(answer) {
    const all = readDB(DB_KEYS.ANSWERS, []);
    all.push(answer);
    writeDB(DB_KEYS.ANSWERS, all);
    return answer;
  },
  getAnswersForUser(userId) {
    return readDB(DB_KEYS.ANSWERS, []).filter((a) => a.userId === userId);
  },
  saveSession(session) {
    const all = readDB(DB_KEYS.SESSIONS, []);
    const idx = all.findIndex((s) => s.id === session.id);
    if (idx >= 0) all[idx] = session; else all.push(session);
    writeDB(DB_KEYS.SESSIONS, all);
    return session;
  },
  getSession(id) {
    return readDB(DB_KEYS.SESSIONS, []).find((s) => s.id === id) || null;
  },
  getSessionsForUser(userId) {
    return readDB(DB_KEYS.SESSIONS, []).filter((s) => s.userId === userId);
  },
};

window.MyMock = window.MyMock || {};
window.MyMock.Auth = Auth;
window.MyMock.PracticeStore = PracticeStore;
window.MyMock.DB_KEYS = DB_KEYS;
