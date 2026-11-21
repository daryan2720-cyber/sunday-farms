/** Session handling for the app. Talks to the auth server and keeps tokens in secure storage. */
import type { FakeAuthServer, LoginOutcome, ResetOutcome, SignUpOutcome } from './authServer';
import { constantTimeEqual, fromHex, pbkdf2, randomBytes, toHex } from './crypto';
import type { DeviceSession, Role, SecurityEvent, Tokens } from './models';

/** Encrypted key-value storage: iOS Keychain / Android Keystore (expo-secure-store). */
export interface SecureStore {
  get(key: string): string | null;
  set(key: string, value: string | null): void;
}

export class MemoryStore implements SecureStore {
  data = new Map<string, string>();
  get(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  set(key: string, value: string | null): void {
    if (value === null) this.data.delete(key);
    else this.data.set(key, value);
  }
}

export type SessionState =
  | { kind: 'loggedOut' }
  /** Signed in before, but the user turned on fingerprint/face unlock. */
  | { kind: 'needsUnlock'; username: string }
  | { kind: 'loggedIn'; username: string; role: Role; twoStep: boolean };

export const K = {
  username: 'username', role: 'role', twoStep: 'two_step',
  access: 'access_token', accessExp: 'access_expires_at', refresh: 'refresh_token',
  biometric: 'biometric_enabled', pinHash: 'parent_pin_hash', pinSalt: 'parent_pin_salt',
};
const SESSION_KEYS = [K.username, K.role, K.twoStep, K.access, K.accessExp, K.refresh, K.biometric];
export const ALL_SECURE_KEYS = [...SESSION_KEYS, K.pinHash, K.pinSalt];

const PIN_ITERATIONS = 2000;

export class AuthService {
  state: SessionState;
  private listeners = new Set<(s: SessionState) => void>();
  readonly store: SecureStore;
  readonly server: FakeAuthServer;
  readonly deviceName: string;

  constructor(store: SecureStore, server: FakeAuthServer, deviceName: string) {
    this.store = store;
    this.server = server;
    this.deviceName = deviceName;
    this.state = this.initialState();
  }

  private initialState(): SessionState {
    const user = this.store.get(K.username);
    if (!user || !this.store.get(K.refresh)) return { kind: 'loggedOut' };
    if (this.biometricEnabled) return { kind: 'needsUnlock', username: user };
    return { kind: 'loggedIn', username: user, role: this.role(), twoStep: this.store.get(K.twoStep) === '1' };
  }

  private role(): Role {
    return this.store.get(K.role) === 'TEACHER' ? 'TEACHER' : 'GROWER';
  }

  onChange(fn: (s: SessionState) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private setState(s: SessionState): void {
    this.state = s;
    this.listeners.forEach((fn) => fn(s));
  }

  get username(): string | null {
    return this.store.get(K.username);
  }

  get biometricEnabled(): boolean {
    return this.store.get(K.biometric) === '1';
  }

  setBiometricEnabled(on: boolean): void {
    this.store.set(K.biometric, on ? '1' : null);
  }

  private saveSession(username: string, role: Role, twoStep: boolean, t: Tokens): void {
    this.store.set(K.username, username);
    this.store.set(K.role, role);
    this.store.set(K.twoStep, twoStep ? '1' : '0');
    this.store.set(K.access, t.accessToken);
    this.store.set(K.accessExp, String(t.accessExpiresAt));
    this.store.set(K.refresh, t.refreshToken);
  }

  // ------------------------------------------------------------ sign up / login

  isUsernameAvailable(username: string): Promise<boolean> {
    return this.server.isUsernameAvailable(username);
  }

  async signUp(username: string, password: string, contact: string): Promise<SignUpOutcome> {
    const o = await this.server.signUp(username, password, contact, this.deviceName);
    if (o.kind === 'success') {
      this.saveSession(o.username, 'GROWER', false, o.tokens);
      this.setState({ kind: 'loggedIn', username: o.username, role: 'GROWER', twoStep: false });
    }
    return o;
  }

  async login(username: string, password: string, captchaSolved: boolean): Promise<LoginOutcome> {
    return this.handle(await this.server.login(username, password, this.deviceName, captchaSolved));
  }

  async verifyLoginCode(challengeId: string, code: string): Promise<LoginOutcome> {
    return this.handle(await this.server.verifyLoginCode(challengeId, code, this.deviceName));
  }

  private handle(o: LoginOutcome): LoginOutcome {
    if (o.kind === 'success') {
      this.saveSession(o.username, o.role, o.twoStep, o.tokens);
      this.setState({ kind: 'loggedIn', username: o.username, role: o.role, twoStep: o.twoStep });
    }
    return o;
  }

  /** Called after a successful fingerprint/face check. */
  unlock(): void {
    const user = this.username;
    if (!user) return this.logoutLocal();
    this.setState({ kind: 'loggedIn', username: user, role: this.role(), twoStep: this.store.get(K.twoStep) === '1' });
  }

  async refreshTokens(): Promise<boolean> {
    const token = this.store.get(K.refresh);
    if (!token) return false;
    const t = await this.server.refresh(token);
    if (!t) {
      this.logoutLocal();
      return false;
    }
    this.store.set(K.access, t.accessToken);
    this.store.set(K.accessExp, String(t.accessExpiresAt));
    this.store.set(K.refresh, t.refreshToken);
    return true;
  }

  // ------------------------------------------------------------ reset and two-step

  requestPasswordReset(username: string): Promise<string | null> {
    return this.server.requestPasswordReset(username);
  }

  confirmPasswordReset(username: string, code: string, newPassword: string): Promise<ResetOutcome> {
    return this.server.confirmPasswordReset(username, code, newPassword);
  }

  async startTwoStepSetup(): Promise<string | null> {
    const u = this.username;
    return u ? this.server.startTwoStepSetup(u) : null;
  }

  async confirmTwoStepSetup(code: string): Promise<boolean> {
    const u = this.username;
    if (!u) return false;
    const ok = await this.server.confirmTwoStepSetup(u, code);
    if (ok) {
      this.store.set(K.twoStep, '1');
      this.setState({ kind: 'loggedIn', username: u, role: this.role(), twoStep: true });
    }
    return ok;
  }

  async disableTwoStep(): Promise<void> {
    const u = this.username;
    if (!u) return;
    await this.server.disableTwoStep(u);
    this.store.set(K.twoStep, '0');
    this.setState({ kind: 'loggedIn', username: u, role: this.role(), twoStep: false });
  }

  // ------------------------------------------------------------ devices and alerts

  async activeSessions(): Promise<DeviceSession[]> {
    const u = this.username;
    if (!u) return [];
    const list = await this.server.activeSessions(u, this.store.get(K.refresh));
    // The demo server forgets sessions when the app restarts; always show this phone.
    return list.length ? list : [{ id: 'this', deviceName: this.deviceName, lastActive: Date.now(), isThisDevice: true }];
  }

  async securityEvents(): Promise<SecurityEvent[]> {
    const u = this.username;
    return u ? this.server.securityEvents(u) : [];
  }

  // ------------------------------------------------------------ log out / delete

  async logout(): Promise<void> {
    const token = this.store.get(K.refresh);
    if (token) await this.server.logout(token);
    this.logoutLocal();
  }

  async logoutEverywhere(): Promise<void> {
    const u = this.username;
    if (u) await this.server.logoutEverywhere(u);
    this.logoutLocal();
  }

  async deleteAccount(): Promise<void> {
    const u = this.username;
    if (u) await this.server.deleteAccount(u);
    ALL_SECURE_KEYS.forEach((k) => this.store.set(k, null));
    this.setState({ kind: 'loggedOut' });
  }

  /** Removes tokens but keeps device settings such as the parent PIN. */
  logoutLocal(): void {
    SESSION_KEYS.forEach((k) => this.store.set(k, null));
    this.setState({ kind: 'loggedOut' });
  }

  // ------------------------------------------------------------ parent PIN (Kids mode)

  get hasParentPin(): boolean {
    return this.store.get(K.pinHash) !== null;
  }

  setParentPin(pin: string): void {
    const salt = randomBytes(16);
    this.store.set(K.pinSalt, toHex(salt));
    this.store.set(K.pinHash, toHex(pbkdf2(pin, salt, PIN_ITERATIONS)));
  }

  verifyParentPin(pin: string): boolean {
    const salt = this.store.get(K.pinSalt);
    const stored = this.store.get(K.pinHash);
    if (!salt || !stored) return false;
    return constantTimeEqual(stored, toHex(pbkdf2(pin, fromHex(salt), PIN_ITERATIONS)));
  }
}
