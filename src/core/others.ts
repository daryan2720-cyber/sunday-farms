/** Weather tips, Community Q&A, Kids missions, School mode, plant health check and moisture sensor. */
import { randomBytes, toHex } from './crypto';
import type { Badge, FoundSensor, HealthResult, Mission, Post, SchoolClass, WeatherTip } from './models';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// ================================================================ weather

export const CITIES = ['Delhi', 'Mumbai', 'Bengaluru', 'Chennai', 'Kolkata', 'Pune', 'Jaipur', 'Lucknow', 'Hyderabad'];

/** Uses the chosen city only (no GPS). In production the SERVER calls the weather API
 * (GET /tips/weather) so the API key never ships inside the app. */
export function weatherTipSync(city: string): WeatherTip {
  if (['Delhi', 'Jaipur', 'Lucknow'].includes(city)) {
    return { city, condition: 'Heatwave', tempC: 41, isWarning: true,
      tip: 'Water early morning and after sunset. Move pots into shade from 12 to 4 pm and add a layer of dry leaves on the soil.' };
  }
  if (['Mumbai', 'Kolkata'].includes(city)) {
    return { city, condition: 'Heavy rain', tempC: 28, isWarning: true,
      tip: 'Skip watering today. Move pots under cover and make sure the drainage holes are clear.' };
  }
  if (city === 'Chennai') {
    return { city, condition: 'Hot and humid', tempC: 34, isWarning: false,
      tip: 'Water once in the evening. Humid air raises fungus risk, so keep leaves dry.' };
  }
  return { city, condition: 'Pleasant', tempC: 26, isWarning: false, tip: 'Good growing weather. Water when the top 2 cm of soil is dry.' };
}

export async function weatherTip(city: string, delayMs = 300): Promise<WeatherTip> {
  if (delayMs) await sleep(delayMs);
  return weatherTipSync(city);
}

// ================================================================ community

export type PostResult = 'ok' | 'community_blocked' | 'community_too_short';
const BLOCKED = ['idiot', 'stupid', 'scam', 'hate'];

/** Q&A with reporting. Reported posts go to the moderation queue on the server (reviewed within
 * 24 hours); here they show as "under review". Never shown in Kids mode. */
export class CommunityStore {
  posts: Post[];
  private currentUser: () => string | null;

  constructor(currentUser: () => string | null) {
    this.currentUser = currentUser;
    const now = Date.now();
    const h = 3600 * 1000;
    const p = (id: string, author: string, text: string, parentId: string | null, isExpert: boolean, votes: number, ago: number): Post =>
      ({ id, author, text, parentId, isExpert, votes, status: 'visible', createdAt: now - ago * h, votedByMe: false });
    this.posts = [
      p('q1', 'balcony_bhavna', 'My tomato leaves are turning yellow from the bottom. I water every day. What am I doing wrong?', null, false, 12, 5),
      p('a1', 'agri_expert_meera', 'Daily watering is usually too much for a grow bag. Water only when the top 2 cm is dry, and add vermicompost; lower leaves yellowing can also mean low nitrogen.', 'q1', true, 18, 4),
      p('a2', 'terrace_tarun', 'Same happened to me. Cutting back to every 2-3 days fixed it.', 'q1', false, 4, 3),
      p('q2', 'first_time_farmer', 'How many hours of sun does spinach need? My balcony gets about 3 hours.', null, false, 7, 26),
      p('a3', 'agri_expert_meera', '3 to 4 hours is fine for spinach, lettuce and coriander. Avoid tomatoes and strawberries there.', 'q2', true, 9, 25),
      p('q3', 'pune_planter', 'Is neem oil safe to use on herbs I will eat?', null, false, 5, 50),
    ];
  }

  questions(): Post[] {
    return this.posts.filter((p) => p.parentId === null);
  }

  post(id: string): Post | undefined {
    return this.posts.find((p) => p.id === id);
  }

  answersFor(questionId: string): Post[] {
    return this.posts.filter((p) => p.parentId === questionId)
      .sort((a, b) => Number(b.isExpert) - Number(a.isExpert) || b.votes - a.votes);
  }

  ask(text: string): PostResult {
    return this.add(text, null);
  }

  answer(questionId: string, text: string): PostResult {
    return this.add(text, questionId);
  }

  private add(text: string, parentId: string | null): PostResult {
    const clean = text.trim();
    if (clean.length < 10) return 'community_too_short';
    if (BLOCKED.some((w) => clean.toLowerCase().includes(w))) return 'community_blocked';
    this.posts.unshift({ id: toHex(randomBytes(8)), author: this.currentUser() ?? 'me', text: clean, parentId,
      isExpert: false, votes: 0, status: 'visible', createdAt: Date.now(), votedByMe: false });
    return 'ok';
  }

  toggleVote(id: string): void {
    const p = this.post(id);
    if (!p) return;
    p.votes += p.votedByMe ? -1 : 1;
    p.votedByMe = !p.votedByMe;
  }

  report(id: string): void {
    const p = this.post(id);
    if (p) p.status = 'reported';
  }
}

// ================================================================ kids

export interface PinChecker {
  readonly hasParentPin: boolean;
  setParentPin(pin: string): void;
  verifyParentPin(pin: string): boolean;
}

/** Kids mode runs inside the parent's account. No child account, no age or photo stored,
 * no community or sharing. Leaving Kids mode needs the parent PIN. */
export class KidsStore {
  active = false;
  nickname = 'Sprout Explorer';
  missions: Mission[] = [
    { id: 'm1', title: 'Paint your pot and give your plant a name', emoji: '🎨', done: false },
    { id: 'm2', title: 'Sow three seeds and tuck them in', emoji: '🌱', done: false },
    { id: 'm3', title: 'Water with the mini can, just a little', emoji: '💧', done: false },
    { id: 'm4', title: 'Draw how tall your sprout is today', emoji: '📏', done: false },
    { id: 'm5', title: 'Find one bug friend with the magnifier', emoji: '🐞', done: false },
  ];
  private failed = 0;
  private lockedUntil = 0;
  private pins: PinChecker;
  private now: () => number;

  constructor(pins: PinChecker, now: () => number = () => Date.now()) {
    this.pins = pins;
    this.now = now;
  }

  get hasPin(): boolean {
    return this.pins.hasParentPin;
  }

  setPin(pin: string): void {
    this.pins.setParentPin(pin);
  }

  enter(nickname = ''): void {
    if (nickname.trim()) this.nickname = nickname.trim().slice(0, 20);
    this.active = true;
  }

  /** 0 = exited, -1 = wrong PIN, >0 = seconds to wait after too many wrong PINs. */
  tryExit(pin: string): number {
    const now = this.now();
    if (this.lockedUntil > now) return Math.floor((this.lockedUntil - now) / 1000) + 1;
    if (this.pins.verifyParentPin(pin)) {
      this.failed = 0;
      this.active = false;
      return 0;
    }
    this.failed++;
    if (this.failed >= 5) {
      this.failed = 0;
      this.lockedUntil = now + 30_000;
      return 30;
    }
    return -1;
  }

  toggle(id: string): void {
    const m = this.missions.find((x) => x.id === id);
    if (m) m.done = !m.done;
  }

  doneCount(): number {
    return this.missions.filter((m) => m.done).length;
  }

  badges(): Badge[] {
    const done = (id: string) => this.missions.find((m) => m.id === id)?.done ?? false;
    const n = this.doneCount();
    return [
      { id: 'first', title: 'First mission', emoji: '⭐', earned: n >= 1 },
      { id: 'water', title: 'Water hero', emoji: '💧', earned: done('m3') },
      { id: 'bug', title: 'Bug buddy', emoji: '🐞', earned: done('m5') },
      { id: 'artist', title: 'Pot artist', emoji: '🎨', earned: done('m1') },
      { id: 'super', title: 'Super grower', emoji: '🏆', earned: n === this.missions.length },
    ];
  }

  resetWeek(): void {
    this.missions.forEach((m) => { m.done = false; });
  }
}

// ================================================================ school

/** Teacher dashboard: one class kit, class missions and progress. No student accounts or names. */
export class SchoolStore {
  schoolClass: SchoolClass = {
    schoolName: 'Green Valley Public School', className: 'Class 4B', kitName: 'Little Sprouts (class kit)', studentCount: 32,
    missions: [
      { id: 'c1', title: 'Sow seeds as a class', emoji: '🌱', done: true },
      { id: 'c2', title: 'Make a watering rota', emoji: '🗓️', done: true },
      { id: 'c3', title: 'Measure and chart sprout height', emoji: '📏', done: false },
      { id: 'c4', title: 'Bug hunt in the school garden', emoji: '🐞', done: false },
      { id: 'c5', title: 'Harvest and taste day', emoji: '🥗', done: false },
    ],
  };

  toggle(id: string): void {
    const m = this.schoolClass.missions.find((x) => x.id === id);
    if (m) m.done = !m.done;
  }
}

// ================================================================ plant health check

/**
 * Stand-in until the trained model is ready. The real check runs a TensorFlow Lite / Core ML
 * model on the phone (needs a development build, not Expo Go). Ship it only if accuracy on the
 * top 5 problems is at least 80% (test plan, section 6.8). The photo never leaves the phone.
 */
export async function analyzeLeaf(photoFingerprint: number, delayMs = 800): Promise<HealthResult> {
  if (delayMs) await sleep(delayMs);
  const results: HealthResult[] = [
    { issue: 'Looks healthy', confidence: 0.78, advice: 'Leaves look green and even. Keep your watering routine and check under leaves for pests each week.' },
    { issue: 'Possible yellowing (nitrogen shortage or overwatering)', confidence: 0.64, advice: 'Check that the soil is not soggy. Let the top 2 cm dry before watering, and add a handful of vermicompost.' },
    { issue: 'Possible leaf spot or sun scorch', confidence: 0.58, advice: 'Remove badly spotted leaves, avoid wetting leaves when watering, and give some shade in the afternoon.' },
  ];
  return results[Math.abs(Math.floor(photoFingerprint)) % results.length];
}

// ================================================================ moisture sensor

export const DEMO_PAIRING_CODE = '2468';

/**
 * Pretends to be a low-cost BLE soil sensor. Real Bluetooth needs react-native-ble-plx in a
 * development build (Expo Go can't load it): scan for the sensor's service UUID, connect and
 * subscribe to the moisture characteristic.
 */
export class FakeMoistureSensor {
  batteryPct = 64;
  private value = 45;
  private seed: number;

  constructor(seed = 7) {
    this.seed = seed;
  }

  private rand(n: number): number {
    this.seed = (this.seed * 1103515245 + 12345) % 2147483648;
    return this.seed % n;
  }

  async scan(delayMs = 1500): Promise<FoundSensor[]> {
    if (delayMs) await sleep(delayMs);
    return [
      { id: 'SF-MS-01A3', name: 'Sunday Farms Soil Sensor 01A3', signal: -48 },
      { id: 'SF-MS-7C21', name: 'Sunday Farms Soil Sensor 7C21', signal: -71 },
    ];
  }

  async pair(_sensorId: string, code: string, delayMs = 700): Promise<boolean> {
    if (delayMs) await sleep(delayMs);
    return code.trim() === DEMO_PAIRING_CODE;
  }

  /** Next moisture reading (%). Call every couple of seconds. */
  read(): number {
    this.value = Math.max(10, Math.min(90, this.value + this.rand(6) - 3));
    if (this.rand(10) === 0) this.batteryPct = Math.max(5, this.batteryPct - 1);
    return this.value;
  }
}

export function moistureAdviceKey(v: number): string {
  if (v < 30) return 'sensor_advice_dry';
  if (v > 70) return 'sensor_advice_wet';
  return 'sensor_advice_ok';
}
