/**
 * Kits, rentals, return rewards and eco impact. Runs on sample data.
 * Prices are illustrative (from the pitch prototype) and must be validated before launch.
 */
import { randomBytes, toHex } from './crypto';
import type { EcoImpact, Kit, PaymentMethod, Rental, RentalStatus, RewardEntry } from './models';

const BASE = [
  '12-inch grow bags', 'Cocopeat and soil mix', 'Seeds', 'Vermicompost',
  'Neem oil spray bottle', '2-litre watering can', 'Hand trowel and fork',
  'Gardening gloves', 'Plant labels', 'Moisture meter',
];

export const KITS: Kit[] = [
  { id: 'balcony_starter', name: 'Balcony Starter', emoji: '🍅', monthlyPriceInr: 399, minMonths: 3, depositInr: 500, minAreaSqFt: 12,
    crops: ['Tomato', 'Chilli', 'Spinach'], contents: BASE, description: 'Beginner-friendly kit for a small sunny balcony.', forKids: false },
  { id: 'salad_window_box', name: 'Salad Window Box', emoji: '🥬', monthlyPriceInr: 349, minMonths: 3, depositInr: 400, minAreaSqFt: 4,
    crops: ['Lettuce', 'Spinach', 'Coriander'], contents: ['Window box planter', ...BASE.slice(1)],
    description: 'Fits a windowsill. Fresh salad leaves in about 4 weeks.', forKids: false },
  { id: 'berry_box', name: 'Berry and Herb Box', emoji: '🍓', monthlyPriceInr: 449, minMonths: 4, depositInr: 600, minAreaSqFt: 8,
    crops: ['Strawberry', 'Mint'], contents: ['Hanging strawberry planter', ...BASE],
    description: 'Strawberries and mint for a sunny corner with 6+ hours of sun.', forKids: false },
  { id: 'little_sprouts', name: 'Little Sprouts', emoji: '🌱', monthlyPriceInr: 349, minMonths: 2, depositInr: 300, minAreaSqFt: 3,
    crops: ['Methi', 'Spinach', 'Coriander'],
    contents: ['Mini pots', 'Washable paint pens', 'Mini watering can', 'Small towel and rake', 'Magnifier', 'Seeds', 'Cocopeat'],
    description: 'Kid-sized kit with weekly missions in the app.', forKids: true },
];

const SHADE_TOLERANT = new Set(['Spinach', 'Lettuce', 'Coriander', 'Mint', 'Methi']);
export const RETURN_REWARD = 200;
const ORDER: RentalStatus[] = ['status_placed', 'status_packed', 'status_out_for_delivery', 'status_delivered'];

export class KitStore {
  kits = KITS;
  rentals: Rental[] = [];
  rewards: RewardEntry[] = [{ reason: 'Welcome bonus', points: 100, at: Date.now() }];
  private delay: number;

  constructor(paymentDelayMs = 900) {
    this.delay = paymentDelayMs;
  }

  kit(id: string): Kit | undefined {
    return this.kits.find((k) => k.id === id);
  }

  get pointsBalance(): number {
    return this.rewards.reduce((s, r) => s + r.points, 0);
  }

  /** 2 points = ₹1. Points can't be transferred between accounts. */
  pointsToInr(points: number): number {
    return Math.floor(points / 2);
  }

  /** Up to half of the first month's rent. */
  maxPointsUsable(kit: Kit): number {
    return Math.min(this.pointsBalance, kit.monthlyPriceInr);
  }

  recommend(areaSqFt: number, sunHours: number, forKids: boolean): Kit[] {
    let fits = this.kits.filter((k) => k.minAreaSqFt <= areaSqFt && k.forKids === forKids);
    if (sunHours < 4) fits = fits.filter((k) => k.crops.some((c) => SHADE_TOLERANT.has(c)));
    return [...fits].sort((a, b) => b.minAreaSqFt - a.minAreaSqFt);
  }

  async rent(kit: Kit, months: number, usePoints: number, _method: PaymentMethod): Promise<Rental> {
    if (this.delay) await new Promise((r) => setTimeout(r, this.delay)); // payment gateway round trip
    const rental: Rental = {
      id: 'SF-' + toHex(randomBytes(3)).toUpperCase(), kit, months, startedAt: Date.now(),
      status: 'status_placed', depositStatus: 'deposit_held',
      paidInr: kit.monthlyPriceInr + kit.depositInr - this.pointsToInr(usePoints), pointsUsed: usePoints, returnPhotos: 0,
    };
    if (usePoints > 0) this.addReward(`Used on ${kit.name}`, -usePoints);
    this.rentals.unshift(rental);
    return rental;
  }

  private rental(id: string): Rental | undefined {
    return this.rentals.find((r) => r.id === id);
  }

  /** Demo only: moves an order to the next delivery step. The real status comes from the server. */
  advanceDemoStatus(id: string): void {
    const r = this.rental(id);
    if (!r) return;
    const i = ORDER.indexOf(r.status);
    if (i >= 0 && i < ORDER.length - 1) r.status = ORDER[i + 1];
  }

  bookReturn(id: string, pickupDate: string, photos: number): void {
    const r = this.rental(id);
    if (r && r.status === 'status_delivered') {
      r.status = 'status_return_booked';
      r.returnPickupDate = pickupDate;
      r.returnPhotos = photos;
    }
  }

  /** Demo only: the pickup team marks the kit returned and checks its condition. */
  completeDemoReturn(id: string, goodCondition: boolean): void {
    const r = this.rental(id);
    if (!r || r.status !== 'status_return_booked') return;
    r.status = 'status_returned';
    r.depositStatus = 'deposit_refund_pending';
    if (goodCondition) this.addReward(`${r.kit.name} returned in good condition`, RETURN_REWARD);
  }

  private addReward(reason: string, points: number): void {
    this.rewards.unshift({ reason, points, at: Date.now() });
  }

  ecoImpact(harvestKg: number): EcoImpact {
    // Rough estimates: each rented kit avoids ~1.2 kg of new plastic; each kg grown at home
    // avoids ~150 km of food transport.
    return {
      plasticSavedG: this.rentals.length * 1200,
      foodMilesSavedKm: Math.floor(harvestKg * 150),
      kitsReused: this.rentals.filter((r) => r.status === 'status_returned').length,
      harvestKg,
    };
  }
}

/** Indian digit grouping: ₹1,25,000. */
export function inr(amount: number): string {
  const neg = amount < 0;
  let s = String(Math.abs(Math.round(amount)));
  if (s.length > 3) {
    let head = s.slice(0, -3);
    const tail = s.slice(-3);
    const groups: string[] = [];
    while (head.length > 2) {
      groups.unshift(head.slice(-2));
      head = head.slice(0, -2);
    }
    if (head) groups.unshift(head);
    s = groups.join(',') + ',' + tail;
  }
  return (neg ? '-' : '') + '₹' + s;
}
