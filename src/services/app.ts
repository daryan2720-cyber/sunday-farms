/**
 * Creates every service the screens use and holds navigation state. Screens re-render
 * when `emit()` is called (see useApp).
 */
import Constants from 'expo-constants';
import * as ExpoCrypto from 'expo-crypto';
import * as SecureStoreLib from 'expo-secure-store';
import * as SQLite from 'expo-sqlite';
import Storage from 'expo-sqlite/kv-store';
import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

import { ALL_SECURE_KEYS, AuthService } from '../core/auth';
import type { SecureStore } from '../core/auth';
import { FakeAuthServer } from '../core/authServer';
import { setRandomSource } from '../core/crypto';
import { GardenStore } from '../core/garden';
import type { Db } from '../core/garden';
import { KitStore } from '../core/kits';
import { CommunityStore, FakeMoistureSensor, KidsStore, SchoolStore } from '../core/others';
import { setLanguage } from '../i18n';
import { setScreenshotsBlocked } from './native';

setRandomSource((n) => ExpoCrypto.getRandomBytes(n));

// ---------------------------------------------------------------- storage adapters

/** iOS Keychain / Android Keystore, readable only while the phone is unlocked, never backed up. */
class KeychainStore implements SecureStore {
  private cache = new Map<string, string>();
  private options = { keychainAccessible: SecureStoreLib.WHEN_UNLOCKED_THIS_DEVICE_ONLY };

  constructor(keys: string[]) {
    for (const k of keys) {
      try {
        // getItem throws if an entry can't be read (e.g. after a device restore); treat it as missing.
        const v = SecureStoreLib.getItem(k, this.options);
        if (v !== null) this.cache.set(k, v);
      } catch {
        SecureStoreLib.deleteItemAsync(k, this.options).catch(() => undefined);
      }
    }
  }

  get(key: string): string | null {
    return this.cache.get(key) ?? null;
  }

  set(key: string, value: string | null): void {
    if (value === null) {
      this.cache.delete(key);
      SecureStoreLib.deleteItemAsync(key, this.options).catch(() => undefined);
    } else {
      this.cache.set(key, value);
      SecureStoreLib.setItemAsync(key, value, this.options).catch(() => undefined);
    }
  }
}

/** Non-secret settings (language, city, consent) in the app's private SQLite key-value store. */
export class Settings {
  get<T>(key: string, fallback: T): T {
    const raw = Storage.getItemSync(key);
    if (raw === null || raw === undefined) return fallback;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  }

  set(key: string, value: unknown): void {
    Storage.setItemSync(key, JSON.stringify(value));
  }
}

function openDb(): Db {
  const db = SQLite.openDatabaseSync('sunday_farms.db');
  return {
    exec: (sql) => db.execSync(sql),
    run: (sql, params = []) => ({ lastInsertRowId: db.runSync(sql, params).lastInsertRowId }),
    all: <T,>(sql: string, params: (string | number | null)[] = []) => db.getAllSync<T>(sql, params),
  };
}

// ---------------------------------------------------------------- navigation

export interface Route {
  name: string;
  params?: Record<string, unknown>;
}

export type Mode = 'onboarding' | 'auth' | 'unlock' | 'kids' | 'main';
export const TABS = ['home', 'scan', 'kits', 'garden', 'kids'] as const;
export type Tab = (typeof TABS)[number];

export const SECURE_ROUTES = new Set(['Login', 'SignUp', 'Forgot', 'Unlock', 'Checkout']);

// ---------------------------------------------------------------- app

export class AppModel {
  settings = new Settings();
  auth: AuthService;
  kits = new KitStore();
  garden = new GardenStore(openDb());
  community: CommunityStore;
  kids: KidsStore;
  school = new SchoolStore();
  sensor = new FakeMoistureSensor();

  mode: Mode = 'onboarding';
  tab: string = 'home';
  stacks: Record<string, Route[]> = {};
  version = 0;
  private listeners = new Set<() => void>();

  constructor() {
    setLanguage(this.settings.get('language', 'en'));
    const freshInstall = !this.settings.get('installed', false);
    if (freshInstall) {
      // iOS keeps Keychain items after an app is deleted; start clean on a fresh install.
      ALL_SECURE_KEYS.forEach((k) => SecureStoreLib.deleteItemAsync(k).catch(() => undefined));
      this.settings.set('installed', true);
    }
    const store = new KeychainStore(freshInstall ? [] : ALL_SECURE_KEYS);
    const device = Constants.deviceName ?? (Platform.OS === 'ios' ? 'iPhone' : 'Android phone');
    this.auth = new AuthService(store, new FakeAuthServer(), device);
    this.community = new CommunityStore(() => this.auth.username);
    this.kids = new KidsStore(this.auth);
    // Kids mode survives an app restart, so a child can't leave it by closing the app.
    if (this.settings.get('kids_mode_active', false) && this.auth.state.kind === 'loggedIn' && this.auth.hasParentPin) {
      this.kids.active = true;
    }
    this.auth.onChange(() => this.refreshRoot());
    this.refreshRoot();
  }

  // -------- change notification

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  getVersion = () => this.version;

  emit(): void {
    this.version++;
    this.listeners.forEach((fn) => fn());
  }

  setLanguage(code: string): void {
    setLanguage(code);
    this.settings.set('language', code);
    this.emit();
  }

  // -------- which flow is showing

  refreshRoot(): void {
    const state = this.auth.state;
    if (!this.settings.get('onboarding_done', false)) this.start('onboarding', [{ name: 'Onboarding' }]);
    else if (state.kind === 'loggedIn') {
      if (this.kids.active) this.start('kids', [{ name: 'KidsMode' }]);
      else if (this.mode !== 'main') {
        this.mode = 'main';
        this.tab = 'home';
        this.stacks = { home: [{ name: 'Home' }], scan: [{ name: 'Scan' }], kits: [{ name: 'Kits' }], garden: [{ name: 'Garden' }], kids: [{ name: 'Kids' }] };
      }
    } else if (state.kind === 'needsUnlock') this.start('unlock', [{ name: 'Unlock' }]);
    else this.start('auth', [{ name: 'Login' }]);
    this.afterNavigate();
  }

  private start(mode: Mode, stack: Route[]): void {
    this.mode = mode;
    this.tab = mode;
    this.stacks = { [mode]: stack };
  }

  get stack(): Route[] {
    return this.stacks[this.tab] ?? [];
  }

  get top(): Route {
    const s = this.stack;
    return s[s.length - 1];
  }

  push(name: string, params?: Record<string, unknown>): void {
    this.stack.push({ name, params });
    this.afterNavigate();
  }

  back(): boolean {
    if (this.stack.length <= 1) return false;
    this.stack.pop();
    this.afterNavigate();
    return true;
  }

  popToRootAndPush(name: string, params?: Record<string, unknown>): void {
    this.stack.splice(1);
    this.push(name, params);
  }

  switchTab(tab: string): void {
    if (this.tab === tab) this.stack.splice(1); // tapping the current tab again returns to its first page
    this.tab = tab;
    this.afterNavigate();
  }

  private afterNavigate(): void {
    setScreenshotsBlocked(SECURE_ROUTES.has(this.top?.name ?? '')).catch(() => undefined);
    this.emit();
  }
}

let instance: AppModel | null = null;

export function getApp(): AppModel {
  if (!instance) instance = new AppModel();
  return instance;
}

/** Re-renders the calling component whenever app state changes. */
export function useApp(): AppModel {
  const app = getApp();
  useSyncExternalStore(app.subscribe, app.getVersion);
  return app;
}
