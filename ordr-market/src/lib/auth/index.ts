/**
 * ORDR Market — Auth System
 * localStorage-based user/session management.
 * Production extension point: swap storage layer for API calls.
 */

// ── Types ─────────────────────────────────────────────────────────────────────
export interface User {
  id: string;
  username: string;
  email: string;
  passwordHash: string;
  createdAt: number;
  plan: 'free' | 'pro' | 'enterprise';
  credits: number;
  bio: string;
  avatar: string;
  ownedStrategies: string[];   // strategy IDs user created
  rentedStrategies: string[];  // strategy IDs user has active subscription to
}

export type PublicUser = Omit<User, 'passwordHash'>;

export interface Session {
  token: string;
  userId: string;
  expiresAt: number;
}

export type AuthResult =
  | { ok: true; user: PublicUser; token: string }
  | { ok: false; error: string };

// ── Storage keys ──────────────────────────────────────────────────────────────
const USERS_KEY   = 'ordr_users';
const SESSION_KEY = 'ordr_session';

// ── Utilities ─────────────────────────────────────────────────────────────────
function uid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function token(): string {
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    const bytes = new Uint8Array(24);
    globalThis.crypto.getRandomValues(bytes);
    return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  }
  // SSR fallback — demo only
  return Array.from({ length: 5 }, () => Math.random().toString(36).slice(2)).join('');
}

/** SHA-256 hash via Web Crypto API (async, cryptographically secure) */
async function hash(str: string): Promise<string> {
  if (typeof globalThis.crypto?.subtle?.digest === 'function') {
    const data = new TextEncoder().encode(str);
    const buf = await globalThis.crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, '0')).join('');
  }
  // SSR / test fallback — Node.js crypto
  if (typeof require !== 'undefined') {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const nodeCrypto = require('crypto');
      return nodeCrypto.createHash('sha256').update(str).digest('hex');
    } catch { /* fall through */ }
  }
  // Last resort: DJB2 (non-crypto, only reached in exotic environments)
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h) ^ str.charCodeAt(i);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

function initials(name: string): string {
  return name.slice(0, 2).toUpperCase();
}

// ── Seed demo users (pre-computed SHA-256 password hashes) ────────────────────
const DEMO_USERS: User[] = [
  {
    id: 'user_demo_01',
    username: 'DemoTrader',
    email: 'demo@ordr.market',
    passwordHash: 'd3ad9315b7be5dd53b31a273b3b3aba5defe700808305aa16a3062b76658a791', // SHA-256('demo123')
    createdAt: Date.now() - 86400000 * 30,
    plan: 'free',
    credits: 250,
    bio: 'Algorithmic trader, FX specialist.',
    avatar: 'DT',
    ownedStrategies: ['strat_ema_cross', 'strat_rsi_reversal'],
    rentedStrategies: ['mkt_001', 'mkt_003'],
  },
  {
    id: 'user_pro_01',
    username: 'ProAlgo',
    email: 'pro@ordr.market',
    passwordHash: 'cb1513ece93b4a593042a5c181ab2e123260f197a51a92b758c1697839067669', // SHA-256('pro123')
    createdAt: Date.now() - 86400000 * 90,
    plan: 'pro',
    credits: 5000,
    bio: 'Quant researcher. Former HFT desk.',
    avatar: 'PA',
    ownedStrategies: ['mkt_001', 'mkt_002', 'mkt_003', 'mkt_004'],
    rentedStrategies: [],
  },
];

// ── Storage helpers ───────────────────────────────────────────────────────────
function loadUsers(): User[] {
  if (typeof window === 'undefined') return DEMO_USERS;
  try {
    const raw = localStorage.getItem(USERS_KEY);
    if (!raw) {
      localStorage.setItem(USERS_KEY, JSON.stringify(DEMO_USERS));
      return DEMO_USERS;
    }
    return JSON.parse(raw) as User[];
  } catch {
    return DEMO_USERS;
  }
}

function saveUsers(users: User[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

function loadSession(): Session | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as Session;
    if (session.expiresAt < Date.now()) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

function saveSession(session: Session): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

function clearSession(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(SESSION_KEY);
}

function toPublic(user: User): PublicUser {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { passwordHash, ...pub } = user;
  return pub;
}

// ── Auth API ──────────────────────────────────────────────────────────────────
export async function register(
  email: string,
  username: string,
  password: string,
): Promise<AuthResult> {
  const users = loadUsers();
  if (users.find(u => u.email.toLowerCase() === email.toLowerCase())) {
    return { ok: false, error: 'Email already registered.' };
  }
  if (users.find(u => u.username.toLowerCase() === username.toLowerCase())) {
    return { ok: false, error: 'Username already taken.' };
  }
  if (password.length < 6) {
    return { ok: false, error: 'Password must be at least 6 characters.' };
  }
  const newUser: User = {
    id: 'user_' + uid(),
    username,
    email,
    passwordHash: await hash(password),
    createdAt: Date.now(),
    plan: 'free',
    credits: 100,
    bio: '',
    avatar: initials(username),
    ownedStrategies: [],
    rentedStrategies: [],
  };
  users.push(newUser);
  saveUsers(users);

  const sess: Session = { token: token(), userId: newUser.id, expiresAt: Date.now() + 86400000 * 7 };
  saveSession(sess);
  return { ok: true, user: toPublic(newUser), token: sess.token };
}

export async function login(email: string, password: string): Promise<AuthResult> {
  const users = loadUsers();
  const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());
  if (!user) return { ok: false, error: 'No account found for that email.' };
  if (user.passwordHash !== await hash(password)) return { ok: false, error: 'Incorrect password.' };

  const sess: Session = { token: token(), userId: user.id, expiresAt: Date.now() + 86400000 * 7 };
  saveSession(sess);
  return { ok: true, user: toPublic(user), token: sess.token };
}

export function logout(): void {
  clearSession();
}

export function getCurrentUser(): PublicUser | null {
  const session = loadSession();
  if (!session) return null;
  const users = loadUsers();
  const user = users.find(u => u.id === session.userId);
  return user ? toPublic(user) : null;
}

export function getSessionToken(): string | null {
  return loadSession()?.token ?? null;
}

export function updateUser(id: string, updates: Partial<Pick<User, 'bio' | 'username' | 'credits' | 'ownedStrategies' | 'rentedStrategies'>>): void {
  const users = loadUsers();
  const idx = users.findIndex(u => u.id === id);
  if (idx >= 0) {
    users[idx] = { ...users[idx], ...updates };
    saveUsers(users);
  }
}

export function spendCredits(userId: string, amount: number): boolean {
  const users = loadUsers();
  const user = users.find(u => u.id === userId);
  if (!user || user.credits < amount) return false;
  user.credits -= amount;
  saveUsers(users);
  return true;
}

export function addCredits(userId: string, amount: number): void {
  const users = loadUsers();
  const user = users.find(u => u.id === userId);
  if (user) {
    user.credits += amount;
    saveUsers(users);
  }
}
