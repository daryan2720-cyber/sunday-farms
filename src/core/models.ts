// Plain data types shared by the services and the screens.

export type Role = 'GROWER' | 'TEACHER';

export interface Tokens {
  accessToken: string;
  accessExpiresAt: number;
  refreshToken: string;
}

export interface DeviceSession {
  id: string;
  deviceName: string;
  lastActive: number;
  isThisDevice: boolean;
}

export interface SecurityEvent {
  message: string;
  at: number;
}

// ---------------------------------------------------------------- traceability

/** Values are translation keys. */
export type FieldStatus = 'status_available' | 'status_unverified' | 'status_missing';

export interface Produce {
  id: string;
  name: string;
  emoji: string;
  funFact: string;
}

export interface JourneyField {
  label: string;
  value: string | null;
  status: FieldStatus;
  verifiedBy?: string;
  verifiedOn?: string;
}

export type StageType = 'stage_farm' | 'stage_journey' | 'stage_store' | 'stage_plate';

export interface JourneyStage {
  type: StageType;
  fields: JourneyField[];
}

export interface ProduceJourney {
  batchId: string;
  produceName: string;
  emoji: string;
  stages: JourneyStage[];
}

export type TraceResult =
  | { kind: 'verified'; journey: ProduceJourney }
  /** Signature check failed: label may be copied or fake. Nothing on it is trusted. */
  | { kind: 'invalid'; claimedBatchId: string | null }
  | { kind: 'notFound' };

// ---------------------------------------------------------------- kits

export interface Kit {
  id: string;
  name: string;
  emoji: string;
  monthlyPriceInr: number;
  minMonths: number;
  depositInr: number;
  minAreaSqFt: number;
  crops: string[];
  contents: string[];
  description: string;
  forKids: boolean;
}

export type RentalStatus =
  | 'status_placed' | 'status_packed' | 'status_out_for_delivery'
  | 'status_delivered' | 'status_return_booked' | 'status_returned';

export type DepositStatus = 'deposit_held' | 'deposit_refund_pending' | 'deposit_refunded';

export type PaymentMethod = 'pay_upi' | 'pay_card' | 'pay_autopay';

export interface Rental {
  id: string;
  kit: Kit;
  months: number;
  startedAt: number;
  status: RentalStatus;
  depositStatus: DepositStatus;
  paidInr: number;
  pointsUsed: number;
  returnPickupDate?: string;
  returnPhotos: number;
}

export interface RewardEntry {
  reason: string;
  points: number;
  at: number;
}

export interface EcoImpact {
  plasticSavedG: number;
  foodMilesSavedKm: number;
  kitsReused: number;
  harvestKg: number;
}

// ---------------------------------------------------------------- garden

export interface Plant {
  id: number;
  crop: string;
  nickname: string;
  sownAt: number;
  waterEveryDays: number;
  lastWateredAt: number;
  sensorId: string | null;
  reminderId: string | null;
}

export interface JournalEntry {
  id: number;
  plantId: number;
  createdAt: number;
  note: string;
  heightCm: number | null;
  moisturePct: number | null;
  harvestG: number | null;
  savedInr: number | null;
  photoUri: string | null;
}

export interface Guide {
  id: string;
  crop: string;
  emoji: string;
  title: string;
  steps: string[];
}

export interface WeatherTip {
  city: string;
  condition: string;
  tempC: number;
  tip: string;
  isWarning: boolean;
}

export interface HealthResult {
  issue: string;
  confidence: number;
  advice: string;
}

export interface FoundSensor {
  id: string;
  name: string;
  signal: number;
}

// ---------------------------------------------------------------- community, kids, school

export type PostStatus = 'visible' | 'reported' | 'hidden';

export interface Post {
  id: string;
  author: string;
  text: string;
  parentId: string | null;
  isExpert: boolean;
  votes: number;
  status: PostStatus;
  createdAt: number;
  votedByMe: boolean;
}

export interface Mission {
  id: string;
  title: string;
  emoji: string;
  done: boolean;
}

export interface Badge {
  id: string;
  title: string;
  emoji: string;
  earned: boolean;
}

export interface SchoolClass {
  schoolName: string;
  className: string;
  kitName: string;
  studentCount: number;
  missions: Mission[];
}
