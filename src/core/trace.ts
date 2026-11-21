/**
 * QR traceability. A Sunday Farms label holds "SF1|<batchId>|<signature>".
 *
 * In production the partner portal signs each batch with a private key (Ed25519) and the
 * SERVER checks the signature, so no secret ships in the app. This demo signs with a
 * built-in key only so that verified and fake labels can be shown offline.
 */
import { constantTimeEqual, hmacSha256, toHex, utf8 } from './crypto';
import type { JourneyField, JourneyStage, Produce, ProduceJourney, TraceResult } from './models';

const DEMO_KEY = utf8('sunday-farms-demo-signing-key');

export const PRODUCE: Produce[] = [
  { id: 'tomato', name: 'Tomato', emoji: '🍅', funFact: 'Tomatoes keep ripening after picking.' },
  { id: 'carrot', name: 'Carrot', emoji: '🥕', funFact: 'Carrots were purple before they were orange.' },
  { id: 'spinach', name: 'Spinach', emoji: '🥬', funFact: 'Spinach grows well in partial shade.' },
  { id: 'strawberry', name: 'Strawberry', emoji: '🍓', funFact: 'A strawberry carries about 200 seeds on its skin.' },
  { id: 'broccoli', name: 'Broccoli', emoji: '🥦', funFact: 'The part we eat is a bunch of flower buds.' },
];

const BATCH_FOR: Record<string, string> = { tomato: 'TOM-2611', carrot: 'CAR-1907', spinach: 'SPI-0412', strawberry: 'STR-3301' };

const A = 'status_available' as const;
const U = 'status_unverified' as const;
const M = 'status_missing' as const;

function f(label: string, value: string | null, status: JourneyField['status'], verifiedBy?: string, verifiedOn?: string): JourneyField {
  return { label, value, status, verifiedBy, verifiedOn };
}
function stage(type: JourneyStage['type'], fields: JourneyField[]): JourneyStage {
  return { type, fields };
}

const JOURNEYS: Record<string, ProduceJourney> = {
  'TOM-2611': {
    batchId: 'TOM-2611', produceName: 'Tomato', emoji: '🍅', stages: [
      stage('stage_farm', [
        f('Farm', 'Green Valley Farm, Nashik', A, 'Sunday Farms field visit', '2 Nov 2026'),
        f('Harvest date', '9 Nov 2026', A, 'Farm invoice', '10 Nov 2026'),
        f('Growing method', 'Organic (claimed)', U),
        f('Pesticide test', null, M),
      ]),
      stage('stage_journey', [
        f('Transport', 'Refrigerated truck, 210 km', U),
        f('Days in transit', '1', A, 'Dispatch record', '10 Nov 2026'),
      ]),
      stage('stage_store', [
        f('Store', 'Fresh Basket, Pune', A, 'Store invoice', '11 Nov 2026'),
        f('Arrived', '11 Nov 2026', A, 'Store invoice', '11 Nov 2026'),
      ]),
      stage('stage_plate', [f('Best before', '18 Nov 2026', U)]),
    ],
  },
  'CAR-1907': {
    batchId: 'CAR-1907', produceName: 'Carrot', emoji: '🥕', stages: [
      stage('stage_farm', [
        f('Farm', 'Ooty Hills Cooperative', A, 'Certificate check', '28 Oct 2026'),
        f('Harvest date', null, M),
        f('Growing method', 'Natural farming', A, 'Certificate check', '28 Oct 2026'),
      ]),
      stage('stage_journey', [f('Transport', null, M)]),
      stage('stage_store', [f('Store', "Nature's Cart, Bengaluru", U)]),
      stage('stage_plate', [f('Best before', null, M)]),
    ],
  },
  'SPI-0412': {
    batchId: 'SPI-0412', produceName: 'Spinach', emoji: '🥬', stages: [
      stage('stage_farm', [
        f('Farm', 'Rooftop Greens, Delhi', A, 'Sunday Farms field visit', '5 Nov 2026'),
        f('Harvest date', '13 Nov 2026', A, 'Farm invoice', '13 Nov 2026'),
        f('Growing method', 'Hydroponic', A, 'Sunday Farms field visit', '5 Nov 2026'),
      ]),
      stage('stage_journey', [f('Transport', 'E-rickshaw, 8 km', A, 'Dispatch record', '13 Nov 2026')]),
      stage('stage_store', [f('Store', "Saket Farmers' Market", A, 'Market record', '13 Nov 2026')]),
      stage('stage_plate', [f('Best before', '16 Nov 2026', A, 'Farm label', '13 Nov 2026')]),
    ],
  },
  'STR-3301': {
    batchId: 'STR-3301', produceName: 'Strawberry', emoji: '🍓', stages: [
      stage('stage_farm', [f('Farm', 'Mahabaleshwar (claimed)', U), f('Harvest date', null, M)]),
      stage('stage_journey', [f('Transport', null, M)]),
      stage('stage_store', [f('Store', 'City Fruit Mart, Mumbai', U)]),
      stage('stage_plate', [f('Best before', null, M)]),
    ],
  },
};

function signature(batchId: string): string {
  return toHex(hmacSha256(DEMO_KEY, utf8(batchId)).slice(0, 8));
}

export function demoLabelFor(produceId: string): string | null {
  const batch = BATCH_FOR[produceId];
  return batch ? `SF1|${batch}|${signature(batch)}` : null;
}

/** A copied label with a forged signature, to show what users see for a fake. */
export function demoFakeLabel(): string {
  return 'SF1|TOM-2611|0000000000000000';
}

export function lookupSync(payload: string): TraceResult {
  const parts = payload.trim().split('|');
  if (parts.length !== 3 || parts[0] !== 'SF1') return { kind: 'invalid', claimedBatchId: null };
  const [, batchId, sig] = parts;
  if (!constantTimeEqual(signature(batchId), sig.toLowerCase())) return { kind: 'invalid', claimedBatchId: batchId };
  const journey = JOURNEYS[batchId];
  return journey ? { kind: 'verified', journey } : { kind: 'notFound' };
}

export async function lookup(payload: string, delayMs = 600): Promise<TraceResult> {
  if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
  return lookupSync(payload);
}
