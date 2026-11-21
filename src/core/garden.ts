/** My Garden: plants, grow journal, sensor readings and offline guides, stored in SQLite on the phone. */
import type { Guide, JournalEntry, Plant } from './models';

export const DAY = 24 * 60 * 60 * 1000;

/** Typical retail prices in ₹ per kg, used only to estimate savings. Update before launch. */
export const MARKET_PRICE_PER_KG: Record<string, number> = {
  Tomato: 40, Chilli: 80, Spinach: 40, Strawberry: 400, Lettuce: 150, Coriander: 120, Mint: 160, Methi: 60,
};
const CROP_EMOJI: Record<string, string> = {
  Tomato: '🍅', Chilli: '🌶️', Spinach: '🥬', Strawberry: '🍓', Lettuce: '🥗', Coriander: '🌿', Mint: '🌱', Methi: '☘️',
};

export const emojiFor = (crop: string) => CROP_EMOJI[crop] ?? '🌱';
export const savedInr = (crop: string, grams: number) => Math.floor(((MARKET_PRICE_PER_KG[crop] ?? 50) * grams) / 1000);

/** The small part of a SQLite connection the store needs (expo-sqlite in the app, node:sqlite in tests). */
export interface Db {
  exec(sql: string): void;
  run(sql: string, params?: (string | number | null)[]): { lastInsertRowId: number };
  all<T>(sql: string, params?: (string | number | null)[]): T[];
}

const SCHEMA = `
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS plants (
  id INTEGER PRIMARY KEY AUTOINCREMENT, crop TEXT NOT NULL, nickname TEXT NOT NULL, sownAt REAL NOT NULL,
  waterEveryDays INTEGER NOT NULL, lastWateredAt REAL NOT NULL, sensorId TEXT, reminderId TEXT
);
CREATE TABLE IF NOT EXISTS journal_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT, plantId INTEGER NOT NULL REFERENCES plants(id) ON DELETE CASCADE,
  createdAt REAL NOT NULL, note TEXT NOT NULL, heightCm REAL, moisturePct INTEGER, harvestG INTEGER,
  savedInr INTEGER, photoUri TEXT
);
CREATE TABLE IF NOT EXISTS sensor_readings (
  id INTEGER PRIMARY KEY AUTOINCREMENT, plantId INTEGER NOT NULL REFERENCES plants(id) ON DELETE CASCADE,
  moisturePct INTEGER NOT NULL, readAt REAL NOT NULL, synced INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS guides (id TEXT PRIMARY KEY, crop TEXT NOT NULL, emoji TEXT NOT NULL, title TEXT NOT NULL, steps TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_journal_plant ON journal_entries(plantId);
CREATE INDEX IF NOT EXISTS idx_readings_plant ON sensor_readings(plantId);
`;

export const GUIDES: Guide[] = [
  { id: 'g_tomato', crop: 'Tomato', emoji: '🍅', title: 'Grow tomatoes in a grow bag', steps: [
    'Fill the 12-inch grow bag with the cocopeat and soil mix, leaving 2 cm at the top.',
    'Sow 2 seeds 1 cm deep. Keep only the stronger seedling after 2 weeks.',
    'Place where it gets at least 6 hours of direct sun.',
    "Water when the top 2 cm of soil feels dry. Don't let water stand.",
    'Add a handful of vermicompost every 3 weeks.',
    'Tie the stem to a stick when it reaches 30 cm.',
    'Pick when fruits are fully red and slightly soft.' ] },
  { id: 'g_chilli', crop: 'Chilli', emoji: '🌶️', title: 'Grow chillies on a balcony', steps: [
    'Sow seeds 0.5 cm deep in moist mix.', 'Seeds sprout in 7 to 14 days; keep warm.', 'Give 6 or more hours of sun.',
    'Water lightly every 2 to 3 days.', 'Spray neem oil if you see tiny insects under leaves.', 'Pick green or wait for them to turn red.' ] },
  { id: 'g_spinach', crop: 'Spinach', emoji: '🥬', title: 'Grow spinach in partial shade', steps: [
    'Sprinkle seeds 1 cm apart and cover lightly.', '3 to 4 hours of sun is enough.', 'Keep soil evenly moist but not wet.',
    'Start picking outer leaves after 4 weeks.', 'Cut leaves 2 cm above the soil so they grow back.' ] },
  { id: 'g_strawberry', crop: 'Strawberry', emoji: '🍓', title: 'Grow strawberries in a hanging planter', steps: [
    'Plant runners with the crown just above the soil.', 'Needs 6 or more hours of sun.', 'Water at the base, never on the leaves or fruit.',
    'Remove runners in the first month so the plant grows strong.', 'Pick berries when fully red.' ] },
  { id: 'g_watering', crop: 'All plants', emoji: '💧', title: 'How much water is enough?', steps: [
    'Push a finger 2 cm into the soil. Dry? Water. Damp? Wait.', 'Water slowly until a little drains out of the bottom.',
    'Water early morning or evening, not at midday.', 'In heavy rain, move pots under cover and skip watering.',
    'Yellow, soft leaves often mean too much water.' ] },
  { id: 'g_pests', crop: 'All plants', emoji: '🐞', title: 'Keep pests away naturally', steps: [
    'Check under leaves every week.', 'Mix 5 ml neem oil and a drop of soap in 1 litre of water.',
    'Spray in the evening, every 5 to 7 days, only when you see pests.', 'Ladybirds and spiders are friends; leave them be.' ] },
];

export class GardenStore {
  private db: Db;
  private now: () => number;

  constructor(db: Db, now: () => number = () => Date.now()) {
    this.db = db;
    this.now = now;
    db.exec(SCHEMA);
    const count = db.all<{ n: number }>('SELECT COUNT(*) AS n FROM guides')[0]?.n ?? 0;
    if (!count) {
      for (const g of GUIDES) {
        db.run('INSERT OR REPLACE INTO guides (id, crop, emoji, title, steps) VALUES (?,?,?,?,?)', [g.id, g.crop, g.emoji, g.title, g.steps.join('\n')]);
      }
    }
  }

  // ------------------------------------------------------------ plants

  plants(): Plant[] {
    return this.db.all<Plant>('SELECT * FROM plants ORDER BY sownAt DESC, id DESC');
  }

  plant(id: number): Plant | undefined {
    return this.db.all<Plant>('SELECT * FROM plants WHERE id = ?', [id])[0];
  }

  addPlant(crop: string, nickname: string, waterEveryDays: number): number {
    const now = this.now();
    return this.db.run(
      'INSERT INTO plants (crop, nickname, sownAt, waterEveryDays, lastWateredAt) VALUES (?,?,?,?,?)',
      [crop, nickname.trim() || crop, now, Math.max(1, waterEveryDays), now],
    ).lastInsertRowId;
  }

  setReminderId(plantId: number, reminderId: string | null): void {
    this.db.run('UPDATE plants SET reminderId = ? WHERE id = ?', [reminderId, plantId]);
  }

  markWatered(id: number): void {
    this.db.run('UPDATE plants SET lastWateredAt = ? WHERE id = ?', [this.now(), id]);
  }

  deletePlant(id: number): void {
    this.db.run('DELETE FROM plants WHERE id = ?', [id]);
  }

  linkSensor(id: number, sensorId: string): void {
    this.db.run('UPDATE plants SET sensorId = ? WHERE id = ?', [sensorId, id]);
  }

  /** Plants whose watering is due today or overdue. */
  duePlants(): Plant[] {
    const now = this.now();
    return this.plants().filter((p) => now - p.lastWateredAt >= p.waterEveryDays * DAY - DAY / 2);
  }

  daysUntilWater(p: Plant): number {
    return Math.max(0, p.waterEveryDays - Math.floor((this.now() - p.lastWateredAt) / DAY));
  }

  ageDays(p: Plant): number {
    return Math.floor((this.now() - p.sownAt) / DAY);
  }

  // ------------------------------------------------------------ journal

  journal(plantId: number): JournalEntry[] {
    return this.db.all<JournalEntry>('SELECT * FROM journal_entries WHERE plantId = ? ORDER BY createdAt DESC, id DESC', [plantId]);
  }

  addEntry(plantId: number, e: { note: string; heightCm?: number | null; moisturePct?: number | null; harvestG?: number | null; photoUri?: string | null }): number {
    const p = this.plant(plantId);
    if (!p) throw new Error('plant not found');
    const moisture = e.moisturePct == null ? null : Math.max(0, Math.min(100, e.moisturePct));
    const saved = e.harvestG ? savedInr(p.crop, e.harvestG) : null;
    return this.db.run(
      'INSERT INTO journal_entries (plantId, createdAt, note, heightCm, moisturePct, harvestG, savedInr, photoUri) VALUES (?,?,?,?,?,?,?,?)',
      [plantId, this.now(), e.note.trim(), e.heightCm ?? null, moisture, e.harvestG ?? null, saved, e.photoUri ?? null],
    ).lastInsertRowId;
  }

  /** Grams harvested and ₹ saved across all plants. */
  totals(): { harvestG: number; savedInr: number } {
    const r = this.db.all<{ g: number; s: number }>('SELECT COALESCE(SUM(harvestG),0) AS g, COALESCE(SUM(savedInr),0) AS s FROM journal_entries')[0];
    return { harvestG: Number(r?.g ?? 0), savedInr: Number(r?.s ?? 0) };
  }

  // ------------------------------------------------------------ sensor readings

  saveReading(plantId: number, moisturePct: number): void {
    this.db.run('INSERT INTO sensor_readings (plantId, moisturePct, readAt) VALUES (?,?,?)', [plantId, moisturePct, this.now()]);
  }

  readings(plantId: number, limit = 30): { moisturePct: number; readAt: number }[] {
    return this.db.all('SELECT moisturePct, readAt FROM sensor_readings WHERE plantId = ? ORDER BY readAt DESC, id DESC LIMIT ?', [plantId, limit]);
  }

  // ------------------------------------------------------------ guides and account deletion

  guides(): Guide[] {
    return this.db.all<{ id: string; crop: string; emoji: string; title: string; steps: string }>('SELECT * FROM guides ORDER BY crop')
      .map((g) => ({ ...g, steps: g.steps.split('\n') }));
  }

  deleteAll(): void {
    this.db.run('DELETE FROM plants');
  }
}
