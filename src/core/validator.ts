/**
 * Username and password rules from the security design (section 3).
 *
 * - Username: 4-20 characters, ASCII letters/digits/underscore/period, starts with a
 *   letter, unique ignoring case, reserved and offensive names blocked.
 * - Password: 8-64 characters (12 recommended), any characters including spaces and
 *   emoji, no forced symbol rules, rejects common passwords and ones containing the
 *   username. Breach-list checks (e.g. Have I Been Pwned) run on the server.
 *
 * The server repeats every check; the app checks only to give fast feedback.
 * Error values are translation keys.
 */

export const USERNAME_MIN = 4;
export const USERNAME_MAX = 20;
export const PASSWORD_MIN = 8;
export const PASSWORD_RECOMMENDED = 12;
export const PASSWORD_MAX = 64;

export type UsernameError =
  | 'err_username_short'
  | 'err_username_long'
  | 'err_username_start'
  | 'err_username_chars'
  | 'err_username_reserved';

export type PasswordIssue =
  | 'err_password_short'
  | 'err_password_long'
  | 'err_password_common'
  | 'err_password_username';

const RESERVED = new Set([
  'admin', 'administrator', 'support', 'sundayfarms', 'sunday_farms', 'sunday.farms',
  'root', 'moderator', 'system', 'help', 'official', 'staff', 'security',
]);

// Short placeholder list. The server holds the full blocked-word list.
const BLOCKED = ['idiot', 'stupid', 'damn', 'hate'];

const COMMON = new Set([
  'password', 'password1', 'password123', '12345678', '123456789', '1234567890',
  'qwerty123', 'qwertyuiop', 'iloveyou', '11111111', '00000000', 'abc12345',
  'abcd1234', 'welcome1', 'welcome123', 'sunshine', 'princess', 'football',
  'letmein1', 'admin123', 'india123', 'india@123', 'passw0rd', 'p@ssw0rd',
  'changeme', 'monkey123', 'dragon123', 'baseball', 'superman', 'trustno1',
  'sundayfarms', 'sundayfarms1', 'gardening', 'tomato123',
]);

export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

export function validateUsername(raw: string): UsernameError | null {
  const u = raw.trim();
  const n = normalizeUsername(u);
  if (u.length < USERNAME_MIN) return 'err_username_short';
  if (u.length > USERNAME_MAX) return 'err_username_long';
  if (!/^[A-Za-z]/.test(u)) return 'err_username_start';
  if (!/^[A-Za-z0-9_.]+$/.test(u)) return 'err_username_chars';
  if (RESERVED.has(n) || BLOCKED.some((w) => n.includes(w))) return 'err_username_reserved';
  return null;
}

/** Counts characters the way people do, so one emoji counts as one. */
export function passwordLength(password: string): number {
  return Array.from(password).length;
}

export function validatePassword(password: string, username: string): PasswordIssue[] {
  const issues: PasswordIssue[] = [];
  const len = passwordLength(password);
  if (len < PASSWORD_MIN) issues.push('err_password_short');
  if (len > PASSWORD_MAX) issues.push('err_password_long');
  if (COMMON.has(password.toLowerCase())) issues.push('err_password_common');
  const user = normalizeUsername(username);
  if (user.length >= 3 && password.toLowerCase().includes(user)) issues.push('err_password_username');
  return issues;
}

/** Rough strength from 0 (very weak) to 4 (strong), for the meter only. */
export function strength(password: string, username: string): number {
  if (!password) return 0;
  if (validatePassword(password, username).some((i) => i !== 'err_password_long')) return 0;
  const len = passwordLength(password);
  let score = 1;
  if (len >= PASSWORD_RECOMMENDED) score++;
  if (len >= 16) score++;
  const kinds = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((r) => r.test(password)).length;
  if (kinds >= 3) score++;
  return Math.min(score, 4);
}

export function isPinValid(pin: string): boolean {
  return /^[0-9]{4}$/.test(pin);
}

export function isContactValid(contact: string): boolean {
  const c = contact.trim();
  const isPhone = /^[0-9 +]+$/.test(c) && c.replace(/[^0-9]/g, '').length === 10;
  const isEmail = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c);
  return isPhone || isEmail;
}
