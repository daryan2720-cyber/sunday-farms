/**
 * Simulates the Sunday Farms auth server so the app runs without a backend.
 *
 * It follows the server rules in the software document, so swapping in the real API
 * doesn't change app behaviour:
 * - passwords hashed with a salt (Argon2id on the real server), compared in constant time
 * - 5 failed logins lock the account for 15 minutes; CAPTCHA after 3 failures
 * - one generic error for wrong username OR wrong password
 * - 15-minute access tokens; 30-day refresh tokens rotated on every use;
 *   reuse of an old refresh token ends every session for that user
 * - reset and two-step codes expire in 10 minutes and work once
 * - security alerts on new-device login, password change and lock-out
 *
 * Data lives in memory: accounts created in the demo disappear when the app restarts.
 */
import { constantTimeEqual, pbkdf2, randomBytes, randomCode, randomToken, sha256Hex, toHex } from './crypto';
import type { DeviceSession, Role, SecurityEvent, Tokens } from './models';
import { normalizeUsername, validatePassword, validateUsername } from './validator';
import type { PasswordIssue } from './validator';

export const DEMO_GROWER = 'demo_grower';
export const DEMO_GROWER_PASSWORD = 'Grow my own food 2026';
export const DEMO_TEACHER = 'ms_rao';
export const DEMO_TEACHER_PASSWORD = 'Classroom garden 26';

const CAPTCHA_AFTER = 3;
const LOCK_AFTER = 5;
const LOCK_MS = 15 * 60 * 1000;
const CODE_TTL = 10 * 60 * 1000;
const ACCESS_TTL = 15 * 60 * 1000;
const REFRESH_TTL = 30 * 24 * 60 * 60 * 1000;
// Demo only. The real server uses Argon2id (19 MiB, 2 iterations) plus a server-side pepper.
const HASH_ITERATIONS = 2_000; // kept low so demo logins are instant on budget phones
const DUMMY_SALT = new Uint8Array(16);

export type LoginOutcome =
  | { kind: 'success'; tokens: Tokens; username: string; role: Role; twoStep: boolean }
  /** Password was right; a one-time code is needed. demoCode stands in for the SMS/app code. */
  | { kind: 'twoStep'; challengeId: string; demoCode: string }
  | { kind: 'invalid'; captchaRequired: boolean }
  | { kind: 'locked'; minutesLeft: number }
  | { kind: 'captchaMissing' };

export type SignUpOutcome =
  | { kind: 'success'; tokens: Tokens; username: string }
  | { kind: 'taken' }
  | { kind: 'invalidUsername' }
  | { kind: 'rejected'; issues: PasswordIssue[] };

export type ResetOutcome = { kind: 'success' } | { kind: 'invalidCode' } | { kind: 'rejected'; issues: PasswordIssue[] };

interface UserRecord {
  username: string;
  hash: string;
  salt: Uint8Array;
  contact: string;
  twoStep: boolean;
  role: Role;
  failed: number;
  lockedUntil: number;
  events: SecurityEvent[];
  devices: Set<string>;
}

interface SessionRecord {
  id: string;
  username: string;
  device: string;
  refreshHash: string;
  refreshExpiresAt: number;
  lastActive: number;
  revoked: boolean;
  oldHashes: Set<string>;
}

interface OneTimeCode {
  code: string;
  username: string;
  expiresAt: number;
  used: boolean;
}

export interface ServerOptions {
  networkDelayMs?: number;
  now?: () => number;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const minutes = (ms: number) => Math.ceil(ms / 60000);
const hashPw = (pw: string, salt: Uint8Array) => toHex(pbkdf2(pw, salt, HASH_ITERATIONS));

export class FakeAuthServer {
  private delay: number;
  private now: () => number;
  private users = new Map<string, UserRecord>();
  private sessions: SessionRecord[] = [];
  private challenges = new Map<string, OneTimeCode>();
  private resets = new Map<string, OneTimeCode>();
  private setups = new Map<string, OneTimeCode>();
  private unknownFailures = new Map<string, number>();
  private seeded = false;

  constructor(opts: ServerOptions = {}) {
    this.delay = opts.networkDelayMs ?? 350;
    this.now = opts.now ?? (() => Date.now());
  }

  private async call<T>(fn: () => T): Promise<T> {
    if (this.delay) await sleep(this.delay);
    if (!this.seeded) {
      this.addUser(DEMO_GROWER, DEMO_GROWER_PASSWORD, 'grower@example.com', false, 'GROWER');
      this.addUser(DEMO_TEACHER, DEMO_TEACHER_PASSWORD, 'teacher@example.com', true, 'TEACHER');
      this.seeded = true;
    }
    return fn();
  }

  private addUser(username: string, password: string, contact: string, twoStep: boolean, role: Role): UserRecord {
    const salt = randomBytes(16);
    const user: UserRecord = {
      username, hash: hashPw(password, salt), salt, contact, twoStep, role,
      failed: 0, lockedUntil: 0, events: [], devices: new Set(),
    };
    this.users.set(normalizeUsername(username), user);
    return user;
  }

  // ------------------------------------------------------------ sign up

  isUsernameAvailable(username: string): Promise<boolean> {
    return this.call(() => !this.users.has(normalizeUsername(username)));
  }

  signUp(username: string, password: string, contact: string, device: string): Promise<SignUpOutcome> {
    return this.call((): SignUpOutcome => {
      if (validateUsername(username)) return { kind: 'invalidUsername' };
      const issues = validatePassword(password, username);
      if (issues.length) return { kind: 'rejected', issues };
      if (this.users.has(normalizeUsername(username))) return { kind: 'taken' };
      const user = this.addUser(username.trim(), password, contact.trim(), false, 'GROWER');
      user.devices.add(device);
      user.events.push({ message: `Account created on ${device}`, at: this.now() });
      return { kind: 'success', tokens: this.issueSession(user, device), username: user.username };
    });
  }

  // ------------------------------------------------------------ log in

  login(username: string, password: string, device: string, captchaSolved: boolean): Promise<LoginOutcome> {
    return this.call((): LoginOutcome => {
      const key = normalizeUsername(username);
      const user = this.users.get(key);
      const now = this.now();
      if (!user) {
        // Spend the same time as a real check so response time doesn't reveal whether the username exists.
        hashPw(password, DUMMY_SALT);
        const failures = (this.unknownFailures.get(key) ?? 0) + 1;
        this.unknownFailures.set(key, failures);
        return { kind: 'invalid', captchaRequired: failures >= CAPTCHA_AFTER };
      }
      if (user.lockedUntil > now) return { kind: 'locked', minutesLeft: minutes(user.lockedUntil - now) };
      if (user.failed >= CAPTCHA_AFTER && !captchaSolved) return { kind: 'captchaMissing' };
      if (!constantTimeEqual(hashPw(password, user.salt), user.hash)) {
        user.failed++;
        if (user.failed >= LOCK_AFTER) {
          user.failed = 0;
          user.lockedUntil = now + LOCK_MS;
          user.events.push({ message: 'Account locked for 15 minutes after 5 failed logins', at: now });
          return { kind: 'locked', minutesLeft: minutes(LOCK_MS) };
        }
        return { kind: 'invalid', captchaRequired: user.failed >= CAPTCHA_AFTER };
      }
      user.failed = 0;
      if (user.twoStep) {
        const challengeId = randomToken(16);
        const code = randomCode();
        this.challenges.set(challengeId, { code, username: key, expiresAt: now + CODE_TTL, used: false });
        return { kind: 'twoStep', challengeId, demoCode: code };
      }
      return { kind: 'success', tokens: this.issueSession(user, device), username: user.username, role: user.role, twoStep: user.twoStep };
    });
  }

  verifyLoginCode(challengeId: string, code: string, device: string): Promise<LoginOutcome> {
    return this.call((): LoginOutcome => {
      const ch = this.challenges.get(challengeId);
      if (!ch || ch.used || ch.expiresAt < this.now() || !constantTimeEqual(ch.code, code.trim())) {
        return { kind: 'invalid', captchaRequired: false };
      }
      ch.used = true;
      this.challenges.delete(challengeId);
      const user = this.users.get(ch.username)!;
      return { kind: 'success', tokens: this.issueSession(user, device), username: user.username, role: user.role, twoStep: user.twoStep };
    });
  }

  // ------------------------------------------------------------ sessions

  private issueSession(user: UserRecord, device: string): Tokens {
    const now = this.now();
    if (!user.devices.has(device)) {
      if (user.devices.size) {
        user.events.push({ message: `New login from ${device}. If this wasn't you, change your password.`, at: now });
      }
      user.devices.add(device);
    }
    const refresh = randomToken();
    this.sessions.push({
      id: randomToken(8), username: normalizeUsername(user.username), device,
      refreshHash: sha256Hex(refresh), refreshExpiresAt: now + REFRESH_TTL, lastActive: now,
      revoked: false, oldHashes: new Set(),
    });
    return { accessToken: randomToken(), accessExpiresAt: now + ACCESS_TTL, refreshToken: refresh };
  }

  /** Rotates the refresh token. Returns null if the session is gone, expired or reused. */
  refresh(refreshToken: string): Promise<Tokens | null> {
    return this.call((): Tokens | null => {
      const h = sha256Hex(refreshToken);
      const now = this.now();
      const reused = this.sessions.find((s) => s.oldHashes.has(h));
      if (reused) {
        // Someone used an old token: it may have been stolen. End every session.
        this.sessions.filter((s) => s.username === reused.username).forEach((s) => { s.revoked = true; });
        this.users.get(reused.username)?.events.push({ message: 'Signed out everywhere: an old session key was reused', at: now });
        return null;
      }
      const session = this.sessions.find((s) => s.refreshHash === h && !s.revoked && s.refreshExpiresAt > now);
      if (!session) return null;
      const next = randomToken();
      session.oldHashes.add(session.refreshHash);
      session.refreshHash = sha256Hex(next);
      session.refreshExpiresAt = now + REFRESH_TTL;
      session.lastActive = now;
      return { accessToken: randomToken(), accessExpiresAt: now + ACCESS_TTL, refreshToken: next };
    });
  }

  logout(refreshToken: string): Promise<void> {
    return this.call(() => {
      const h = sha256Hex(refreshToken);
      this.sessions.filter((s) => s.refreshHash === h).forEach((s) => { s.revoked = true; });
    });
  }

  logoutEverywhere(username: string): Promise<void> {
    return this.call(() => {
      const key = normalizeUsername(username);
      this.sessions.filter((s) => s.username === key).forEach((s) => { s.revoked = true; });
      this.users.get(key)?.events.push({ message: 'Logged out on all devices', at: this.now() });
    });
  }

  activeSessions(username: string, currentRefresh: string | null): Promise<DeviceSession[]> {
    return this.call(() => {
      const key = normalizeUsername(username);
      const current = currentRefresh ? sha256Hex(currentRefresh) : null;
      return this.sessions
        .filter((s) => s.username === key && !s.revoked)
        .map((s) => ({ id: s.id, deviceName: s.device, lastActive: s.lastActive, isThisDevice: s.refreshHash === current }));
    });
  }

  securityEvents(username: string): Promise<SecurityEvent[]> {
    return this.call(() => [...(this.users.get(normalizeUsername(username))?.events ?? [])].sort((a, b) => b.at - a.at));
  }

  // ------------------------------------------------------------ password reset

  /** Behaves the same whether or not the account exists. Returns the code only for the demo. */
  requestPasswordReset(username: string): Promise<string | null> {
    return this.call(() => {
      const key = normalizeUsername(username);
      if (!this.users.has(key)) return null;
      const code = randomCode();
      this.resets.set(key, { code, username: key, expiresAt: this.now() + CODE_TTL, used: false });
      return code;
    });
  }

  confirmPasswordReset(username: string, code: string, newPassword: string): Promise<ResetOutcome> {
    return this.call((): ResetOutcome => {
      const key = normalizeUsername(username);
      const entry = this.resets.get(key);
      const user = this.users.get(key);
      if (!entry || !user || entry.used || entry.expiresAt < this.now() || !constantTimeEqual(entry.code, code.trim())) {
        return { kind: 'invalidCode' };
      }
      const issues = validatePassword(newPassword, username);
      if (issues.length) return { kind: 'rejected', issues };
      entry.used = true;
      this.resets.delete(key);
      user.salt = randomBytes(16);
      user.hash = hashPw(newPassword, user.salt);
      user.lockedUntil = 0;
      user.failed = 0;
      this.sessions.filter((s) => s.username === key).forEach((s) => { s.revoked = true; });
      user.events.push({ message: 'Password changed. All devices were signed out.', at: this.now() });
      return { kind: 'success' };
    });
  }

  // ------------------------------------------------------------ two-step setup

  startTwoStepSetup(username: string): Promise<string> {
    return this.call(() => {
      const key = normalizeUsername(username);
      const code = randomCode();
      this.setups.set(key, { code, username: key, expiresAt: this.now() + CODE_TTL, used: false });
      return code;
    });
  }

  confirmTwoStepSetup(username: string, code: string): Promise<boolean> {
    return this.call(() => {
      const key = normalizeUsername(username);
      const entry = this.setups.get(key);
      const user = this.users.get(key);
      if (!entry || !user || entry.used || entry.expiresAt < this.now() || !constantTimeEqual(entry.code, code.trim())) return false;
      entry.used = true;
      user.twoStep = true;
      user.events.push({ message: 'Two-step login turned on', at: this.now() });
      return true;
    });
  }

  disableTwoStep(username: string): Promise<void> {
    return this.call(() => {
      const user = this.users.get(normalizeUsername(username));
      if (user) {
        user.twoStep = false;
        user.events.push({ message: 'Two-step login turned off', at: this.now() });
      }
    });
  }

  deleteAccount(username: string): Promise<void> {
    return this.call(() => {
      const key = normalizeUsername(username);
      this.users.delete(key);
      this.sessions = this.sessions.filter((s) => s.username !== key);
    });
  }
}
