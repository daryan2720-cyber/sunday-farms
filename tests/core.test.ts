import assert from 'node:assert/strict';
import { createHash, createHmac, pbkdf2Sync, randomBytes as nodeRandom } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';

import { AuthService, MemoryStore } from '../src/core/auth';
import {
  DEMO_GROWER, DEMO_GROWER_PASSWORD, DEMO_TEACHER, DEMO_TEACHER_PASSWORD, FakeAuthServer,
} from '../src/core/authServer';
import { certificateHtml } from '../src/core/certificate';
import * as c from '../src/core/crypto';
import type { Db } from '../src/core/garden';
import { GardenStore, savedInr } from '../src/core/garden';
import { inr, KitStore } from '../src/core/kits';
import { CommunityStore, FakeMoistureSensor, KidsStore, weatherTipSync } from '../src/core/others';
import * as trace from '../src/core/trace';
import * as v from '../src/core/validator';

c.setRandomSource((n) => new Uint8Array(nodeRandom(n)));

function nodeDb(): Db {
  const db = new DatabaseSync(':memory:');
  return {
    exec: (sql) => db.exec(sql),
    run: (sql, params = []) => ({ lastInsertRowId: Number(db.prepare(sql).run(...params).lastInsertRowid) }),
    all: <T>(sql: string, params: (string | number | null)[] = []) => db.prepare(sql).all(...params) as T[],
  };
}

// ---------------------------------------------------------------- crypto matches Node's

test('sha256, hmac and pbkdf2 match node:crypto', () => {
  for (const s of ['', 'abc', 'a'.repeat(55), 'a'.repeat(56), 'a'.repeat(64), 'नमस्ते 🌱'.repeat(20)]) {
    assert.equal(c.sha256Hex(s), createHash('sha256').update(s).digest('hex'));
  }
  const key = c.utf8('k'.repeat(100));
  assert.equal(c.toHex(c.hmacSha256(key, c.utf8('msg'))), createHmac('sha256', 'k'.repeat(100)).update('msg').digest('hex'));
  const salt = new Uint8Array(nodeRandom(16));
  assert.equal(c.toHex(c.pbkdf2('Grow 🌱 food', salt, 1000)), pbkdf2Sync('Grow 🌱 food', salt, 1000, 32, 'sha256').toString('hex'));
  assert.ok(c.constantTimeEqual('abc', 'abc') && !c.constantTimeEqual('abc', 'abd') && !c.constantTimeEqual('abc', 'abcd'));
  const codes = Array.from({ length: 200 }, () => c.randomCode());
  assert.ok(codes.every((x) => /^[1-9][0-9]{5}$/.test(x)));
  assert.match(c.randomToken(), /^[A-Za-z0-9_-]{43}$/);
});

// ---------------------------------------------------------------- validator

test('username rules', () => {
  for (const u of ['ahana', 'Divya_2026', 'rudrani.k', 'abcd', DEMO_GROWER, DEMO_TEACHER]) assert.equal(v.validateUsername(u), null);
  const cases: [string, v.UsernameError][] = [
    ['abc', 'err_username_short'], ['a'.repeat(21), 'err_username_long'], ['1grower', 'err_username_start'],
    ['_grower', 'err_username_start'], ['अहाना12', 'err_username_start'], ['grow er', 'err_username_chars'],
    ['grower!', 'err_username_chars'], ['Admin', 'err_username_reserved'], ['SundayFarms', 'err_username_reserved'],
  ];
  for (const [name, err] of cases) assert.equal(v.validateUsername(name), err, name);
  assert.equal(v.normalizeUsername('Ahana'), v.normalizeUsername(' aHANA '));
});

test('password rules', () => {
  assert.deepEqual(v.validatePassword('grow my own food 2026', 'ahana'), []);
  assert.deepEqual(v.validatePassword('tomatoesandchillies', 'ahana'), []);
  assert.ok(v.validatePassword('short', 'ahana').includes('err_password_short'));
  assert.ok(v.validatePassword('x'.repeat(65), 'ahana').includes('err_password_long'));
  assert.ok(v.validatePassword('Password123', 'ahana').includes('err_password_common'));
  assert.ok(v.validatePassword('ahana-loves-plants', 'Ahana').includes('err_password_username'));
  assert.equal(v.passwordLength('🌱🌱🌱🌱abcd'), 8);
  assert.ok(v.strength('Grow my own food, 2026!', 'ahana') > v.strength('plants12', 'ahana'));
  assert.equal(v.strength('password', 'ahana'), 0);
  assert.ok(v.isPinValid('2468') && !v.isPinValid('246') && !v.isPinValid('24a8'));
  assert.ok(v.isContactValid('9876543210') && v.isContactValid('me@example.com') && !v.isContactValid('me@') && !v.isContactValid('12345'));
});

// ---------------------------------------------------------------- auth server

test('login security rules: lock-out, captcha, generic error, token rotation and reuse', async () => {
  const s = new FakeAuthServer({ networkDelayMs: 0 });
  const ok = await s.login(DEMO_GROWER, DEMO_GROWER_PASSWORD, 'Pixel 7', false);
  assert.equal(ok.kind, 'success');
  assert.equal((await s.login('DEMO_Grower', DEMO_GROWER_PASSWORD, 'Pixel 7', false)).kind, 'success');
  const wrong = await s.login(DEMO_GROWER, 'wrong password!', 'Pixel 7', false);
  const unknown = await s.login('nobody_here', 'whatever123', 'Pixel 7', false);
  assert.equal(wrong.kind, 'invalid');
  assert.equal(unknown.kind, 'invalid');
  await s.login(DEMO_GROWER, 'wrong password!', 'Pixel 7', false);
  const third = await s.login(DEMO_GROWER, 'wrong password!', 'Pixel 7', false);
  assert.deepEqual(third, { kind: 'invalid', captchaRequired: true });
  assert.equal((await s.login(DEMO_GROWER, DEMO_GROWER_PASSWORD, 'Pixel 7', false)).kind, 'captchaMissing');
  await s.login(DEMO_GROWER, 'wrong password!', 'Pixel 7', true);
  assert.deepEqual(await s.login(DEMO_GROWER, 'wrong password!', 'Pixel 7', true), { kind: 'locked', minutesLeft: 15 });
  assert.equal((await s.login(DEMO_GROWER, DEMO_GROWER_PASSWORD, 'Pixel 7', true)).kind, 'locked');

  assert.ok(ok.kind === 'success');
  const t2 = await s.refresh(ok.tokens.refreshToken);
  assert.ok(t2 && t2.refreshToken !== ok.tokens.refreshToken);
  assert.equal(await s.refresh(ok.tokens.refreshToken), null); // reuse rejected
  assert.equal(await s.refresh(t2!.refreshToken), null); // ...and every session ended
  assert.ok((await s.securityEvents(DEMO_GROWER)).some((e) => e.message.includes('reused')));
});

test('lock-out expires after 15 minutes', async () => {
  let now = 1_000_000;
  const s = new FakeAuthServer({ networkDelayMs: 0, now: () => now });
  for (let i = 0; i < 5; i++) await s.login(DEMO_GROWER, 'nope nope', 'P', true);
  assert.equal((await s.login(DEMO_GROWER, DEMO_GROWER_PASSWORD, 'P', true)).kind, 'locked');
  now += 15 * 60 * 1000 + 1;
  assert.equal((await s.login(DEMO_GROWER, DEMO_GROWER_PASSWORD, 'P', true)).kind, 'success');
});

test('two-step login, sign-up and password reset', async () => {
  const s = new FakeAuthServer({ networkDelayMs: 0 });
  const t = await s.login(DEMO_TEACHER, DEMO_TEACHER_PASSWORD, 'Pixel', false);
  assert.equal(t.kind, 'twoStep');
  assert.ok(t.kind === 'twoStep');
  assert.equal((await s.verifyLoginCode(t.challengeId, '000000', 'Pixel')).kind, 'invalid');
  assert.equal((await s.verifyLoginCode(t.challengeId, t.demoCode, 'Pixel')).kind, 'success');
  assert.equal((await s.verifyLoginCode(t.challengeId, t.demoCode, 'Pixel')).kind, 'invalid');

  assert.equal((await s.signUp('new_user', 'password', 'a@b.co', 'Pixel')).kind, 'rejected');
  assert.equal((await s.signUp('new_user', 'grow tomatoes daily', 'a@b.co', 'Pixel')).kind, 'success');
  assert.equal((await s.signUp('NEW_USER', 'grow tomatoes daily', 'a@b.co', 'Pixel')).kind, 'taken');
  assert.equal(await s.isUsernameAvailable('New_User'), false);

  assert.equal(await s.requestPasswordReset('ghost_user'), null);
  const code = (await s.requestPasswordReset('new_user'))!;
  assert.equal((await s.confirmPasswordReset('new_user', '111111', 'a whole new phrase')).kind, 'invalidCode');
  assert.equal((await s.confirmPasswordReset('new_user', code, 'a whole new phrase')).kind, 'success');
  assert.equal((await s.confirmPasswordReset('new_user', code, 'another phrase!!')).kind, 'invalidCode');
  assert.equal((await s.login('new_user', 'grow tomatoes daily', 'Pixel', false)).kind, 'invalid');
  assert.equal((await s.login('new_user', 'a whole new phrase', 'Galaxy A14', false)).kind, 'success');
  assert.ok((await s.securityEvents('new_user')).some((e) => e.message.includes('Galaxy A14')));
});

test('auth service: sessions, biometric restart, parent PIN, two-step setup', async () => {
  const store = new MemoryStore();
  const server = new FakeAuthServer({ networkDelayMs: 0 });
  const a = new AuthService(store, server, 'Test phone');
  const seen: string[] = [];
  a.onChange((st) => seen.push(st.kind));
  assert.equal(a.state.kind, 'loggedOut');
  await a.login(DEMO_GROWER, DEMO_GROWER_PASSWORD, false);
  assert.equal(a.state.kind, 'loggedIn');
  assert.ok(store.get('refresh_token'));
  assert.ok(![...store.data.values()].join('').toLowerCase().includes('grow my own food'));
  a.setBiometricEnabled(true);
  const b = new AuthService(store, server, 'Test phone'); // app restart
  assert.equal(b.state.kind, 'needsUnlock');
  b.unlock();
  assert.equal(b.state.kind, 'loggedIn');
  assert.ok(await b.refreshTokens());
  b.setParentPin('2468');
  assert.ok(b.verifyParentPin('2468') && !b.verifyParentPin('1111'));
  assert.ok(![...store.data.values()].includes('2468'));
  const code = (await b.startTwoStepSetup())!;
  assert.ok(await b.confirmTwoStepSetup(code));
  assert.ok(b.state.kind === 'loggedIn' && b.state.twoStep);
  await b.logout();
  assert.equal(b.state.kind, 'loggedOut');
  assert.ok(b.hasParentPin); // PIN survives logout
  assert.deepEqual(seen, ['loggedIn']);
});

// ---------------------------------------------------------------- trace and kits

test('QR labels: genuine, fake, swapped and same codes as the printed sheet', () => {
  for (const p of ['tomato', 'carrot', 'spinach', 'strawberry']) assert.equal(trace.lookupSync(trace.demoLabelFor(p)!).kind, 'verified');
  assert.equal(trace.lookupSync(trace.demoFakeLabel()).kind, 'invalid');
  assert.equal(trace.lookupSync('https://example.com').kind, 'invalid');
  assert.equal(trace.lookupSync(trace.demoLabelFor('tomato')!.replace('TOM-2611', 'CAR-1907')).kind, 'invalid');
  assert.equal(trace.demoLabelFor('tomato'), 'SF1|TOM-2611|bb7652bb2da56399');
  assert.equal(trace.demoLabelFor('spinach'), 'SF1|SPI-0412|d2543a22b32b6b5c');
});

test('kits: recommend, rent, deliver, return, rewards', async () => {
  const k = new KitStore(0);
  assert.deepEqual(k.recommend(4, 3, false).map((x) => x.id), ['salad_window_box']);
  assert.ok(k.recommend(10, 6, true).every((x) => x.forKids));
  const kit = k.kit('balcony_starter')!;
  const pts = k.maxPointsUsable(kit);
  const r = await k.rent(kit, 3, pts, 'pay_upi');
  assert.equal(r.paidInr, 399 + 500 - Math.floor(pts / 2));
  assert.equal(k.pointsBalance, 100 - pts);
  for (let i = 0; i < 3; i++) k.advanceDemoStatus(r.id);
  assert.equal(r.status, 'status_delivered');
  k.bookReturn(r.id, '18 Nov 2026', 2);
  k.completeDemoReturn(r.id, true);
  assert.equal(r.status, 'status_returned');
  assert.equal(r.depositStatus, 'deposit_refund_pending');
  assert.equal(k.pointsBalance, 100 - pts + 200);
  assert.equal(k.ecoImpact(2).foodMilesSavedKm, 300);
  assert.equal(inr(125000), '₹1,25,000');
  assert.equal(inr(399), '₹399');
  assert.equal(inr(-50), '-₹50');
});

// ---------------------------------------------------------------- garden (real SQLite)

test('garden store with SQLite: due plants, journal, savings, readings, cascade delete', () => {
  let now = 1_000_000;
  const g = new GardenStore(nodeDb(), () => now);
  const id = g.addPlant('Tomato', 'Tommy', 2);
  assert.equal(g.plant(id)?.nickname, 'Tommy');
  assert.deepEqual(g.duePlants(), []);
  now += 2 * 86400000;
  assert.deepEqual(g.duePlants().map((p) => p.id), [id]);
  g.markWatered(id);
  assert.deepEqual(g.duePlants(), []);
  g.addEntry(id, { note: 'first fruit', heightCm: 42.5, moisturePct: 140, harvestG: 500, photoUri: 'file:///x.jpg' });
  const e = g.journal(id)[0];
  assert.equal(e.moisturePct, 100);
  assert.equal(e.savedInr, savedInr('Tomato', 500));
  assert.equal(e.savedInr, 20);
  assert.deepEqual(g.totals(), { harvestG: 500, savedInr: 20 });
  g.saveReading(id, 45);
  assert.equal(g.readings(id)[0].moisturePct, 45);
  assert.equal(g.guides().length, 6);
  assert.ok(g.guides()[0].steps.length > 3);
  g.deletePlant(id);
  assert.deepEqual(g.journal(id), []);
  assert.deepEqual(g.readings(id), []);
});

// ---------------------------------------------------------------- others

test('community, kids PIN lock-out and badges, weather, sensor, certificate', async () => {
  const cm = new CommunityStore(() => 'ahana');
  assert.equal(cm.ask('too short'), 'community_too_short');
  assert.equal(cm.ask('This is a scam question for sure'), 'community_blocked');
  assert.equal(cm.ask('When should I sow coriander seeds?'), 'ok');
  assert.ok(cm.answersFor('q1')[0].isExpert);
  cm.report('q3');
  assert.equal(cm.post('q3')?.status, 'reported');
  cm.toggleVote('q1');
  assert.equal(cm.post('q1')?.votes, 13);
  cm.toggleVote('q1');
  assert.equal(cm.post('q1')?.votes, 12);

  let now = 0;
  const a = new AuthService(new MemoryStore(), new FakeAuthServer({ networkDelayMs: 0 }), 'x');
  const kids = new KidsStore(a, () => now);
  kids.setPin('2468');
  kids.enter('Sprouty');
  assert.ok(kids.active && kids.nickname === 'Sprouty');
  for (let i = 0; i < 4; i++) assert.equal(kids.tryExit('0000'), -1);
  assert.equal(kids.tryExit('0000'), 30);
  assert.ok(kids.tryExit('2468') > 0);
  now += 31000;
  assert.equal(kids.tryExit('2468'), 0);
  assert.equal(kids.active, false);
  kids.missions.forEach((m) => kids.toggle(m.id));
  assert.ok(kids.badges().every((b) => b.earned));

  assert.ok(weatherTipSync('Delhi').isWarning && !weatherTipSync('Pune').isWarning);

  const s = new FakeMoistureSensor(3);
  assert.equal((await s.scan(0)).length, 2);
  assert.ok(await s.pair('SF-MS-01A3', '2468', 0));
  assert.ok(!(await s.pair('SF-MS-01A3', '1111', 0)));
  for (let i = 0; i < 50; i++) {
    const r = s.read();
    assert.ok(r >= 10 && r <= 90);
  }

  const html = certificateHtml({ nickname: '<Sprouty>', heading: 'H', awardedTo: 'A', forCompleting: 'F', programme: 'P', appName: 'S', date: 'D' });
  assert.ok(html.includes('&lt;Sprouty&gt;') && !html.includes('<Sprouty>'));
});

test('English and Hindi strings have the same keys and placeholders', () => {
  const en = JSON.parse(readFileSync(new URL('../src/i18n/en.json', import.meta.url), 'utf8'));
  const hi = JSON.parse(readFileSync(new URL('../src/i18n/hi.json', import.meta.url), 'utf8'));
  assert.deepEqual(Object.keys(en).sort(), Object.keys(hi).sort());
  const ph = (s: string) => (s.match(/\{\d+(?::[^}]*)?\}/g) ?? []).sort();
  for (const key of Object.keys(en)) assert.deepEqual(ph(en[key]), ph(hi[key]), key);
});
