export type Role = 'SUPER_ADMIN' | 'COMPANY_SUPER_ADMIN' | 'COMPANY_ADMIN';
export type TableStatus = 'IN_PLAY' | 'IDLE' | 'OFFLINE' | 'LOCKED';
export type PayMode = 'MANUAL' | 'ONLINE';
export type PayStatus = 'COMPLETED' | 'PENDING' | 'FAILED' | 'REVERSED';
export type Country = 'KE' | 'RW';
export type Currency = 'KES' | 'RWF';
export type PaymentChannel = 'CASH' | 'MPESA' | 'AIRTEL_KE' | 'MTN_RW' | 'AIRTEL_RW' | 'CARD';
export type ChannelStatus = 'NOT_REQUESTED' | 'PENDING' | 'ACTIVE' | 'SUSPENDED';
/** @deprecated kept as an alias; payments now carry a PaymentChannel */
export type PaySub = PaymentChannel;

export const COUNTRY_CURRENCY: Record<Country, Currency> = { KE: 'KES', RW: 'RWF' };
export const COUNTRY_LABEL: Record<Country, string> = { KE: 'Kenya', RW: 'Rwanda' };

export interface Company {
  id: string;
  name: string;
  city: string;
  branches: string[];
  createdAt: number;
  country: Country;
  currency: Currency;
}

/** Entry of GET /channels/catalog */
export interface ChannelCatalogEntry {
  channel: PaymentChannel;
  label: string;
  /** null = available in every country (Cash, Card) */
  country: Country | null;
}

/** Company-level enablement of an online channel */
export interface CompanyChannel {
  channel: PaymentChannel;
  status: ChannelStatus;
  merchantCode: string | null;
  accountName: string | null;
  updatedAt: number | null;
}

export interface BilliardConfig {
  tokenPrice: number;
  accountRef: string;
  cashEnabled: boolean;
  channels: PaymentChannel[];
  /** Paybill/Till used for M-Pesa on this table (required when channels include MPESA) */
  mpesaCredentialId?: string | null;
  /** move the table to another branch of the same company */
  branchId?: string;
}

/** Company → Branch → Billiard */
export interface Branch {
  id: string;
  companyId: string;
  name: string;
  location: string | null;
  tableCount: number;
  createdAt: number;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  companyId?: string;
  /** Billiard ids assigned to a COMPANY_ADMIN */
  assigned: string[];
}

export interface Billiard {
  id: string;
  name: string;
  companyId: string;
  /** branch name (kept for display; mirrors branchName) */
  branch: string;
  branchId: string;
  branchName?: string;
  mpesaCredentialId: string | null;
  mpesaShortcode: string | null;
  mpesaShortcodeType: 'PAYBILL' | 'TILL' | null;
  mpesaLabel: string | null;
  /** MTN MoMo (Rwanda) merchant account collecting this table's payments */
  mtnCredentialId?: string | null;
  mtnLabel?: string | null;
  /** Airtel Money (Rwanda) merchant account collecting this table's payments */
  airtelCredentialId?: string | null;
  airtelLabel?: string | null;
  status: TableStatus;
  credits: number;
  /** price of one token (game) in the company's currency */
  tokenPrice: number;
  /** legacy name for tokenPrice */
  pricePerGame?: number;
  accountRef: string;
  cashEnabled: boolean;
  /** online/offline channels enabled on this table */
  channels: PaymentChannel[];
  currency: Currency;
  releaseMode: ReleaseMode;
  maxGameMinutes: number;
  /** daily credit expiry time 'HH:mm', null = credits carry over */
  creditExpiry: string | null;
  /** overpayment remainder kept on the table */
  walletBalance: number;
  currentGame: Game | null;
  freeCredits: number;
  startedAt?: number | null;
  firmware: string;
  rssi: number;
  lastSeen: number;
  /** MQTT id of the table controller (topics cuetrack/<deviceId>/status|cmd); null = not linked */
  deviceId?: string | null;
  /** ball-release servo calibration (Super Admin) */
  servo?: ServoConfig;
  /** set while LOCKED: why, who and when (ms) */
  lockReason?: string | null;
  lockedBy?: string | null;
  lockedAt?: number | null;
  /** id of a pending device command (shows spinner until ACK) */
  pending?: string | null;
  /** assigned Company Admin (from the backend) */
  adminId?: string | null;
}

export interface Payment {
  id: string;
  billiardId: string;
  companyId: string;
  mode: PayMode;
  channel: PaymentChannel;
  currency: Currency;
  /** masked MSISDN of the payer, e.g. 2547******89 */
  payerMsisdn?: string | null;
  /** provider receipt, e.g. M-Pesa code */
  externalRef?: string | null;
  reference: string;
  tokens: number;
  /** games credited by this payment */
  games: number;
  pricingRule?: RuleRef | null;
  amount: number;
  receivedBy: string;
  status: PayStatus;
  note?: string;
  at: number;
}

export interface ServoConfig {
  /** gate closed / idle angle, 0-180 */
  restAngle: number;
  /** gate open angle, 0-180 */
  openAngle: number;
  /** how long the gate stays open (ms) */
  holdMs: number;
  /** travel time per move (ms) */
  moveMs: number;
}

export const DEFAULT_SERVO: ServoConfig = { restAngle: 90, openAngle: 180, holdMs: 1500, moveMs: 600 };

export interface PingResult {
  reachable: boolean;
  rttMs: number | null;
  lastSeen: number | null;
  status: string;
  message: string | null;
}

export type ActivityKind = 'TOKEN' | 'PAYMENT' | 'GAME_START' | 'GAME_END' | 'LOCK' | 'UNLOCK' | 'OFFLINE' | 'ONLINE';

export interface Activity {
  id: string;
  at: number;
  kind: ActivityKind;
  billiardId: string;
  title: string;
  detail: string;
  mode?: PayMode;
}

export const ROLE_LABEL: Record<Role, string> = {
  SUPER_ADMIN: 'Super Admin',
  COMPANY_SUPER_ADMIN: 'Company Super Admin',
  COMPANY_ADMIN: 'Company Admin',
};

export const STATUS_LABEL: Record<TableStatus, string> = {
  IN_PLAY: 'In play',
  IDLE: 'Idle',
  OFFLINE: 'Offline',
  LOCKED: 'Locked',
};

export const SUB_LABEL: Record<PaymentChannel, string> = {
  CASH: 'Cash',
  MPESA: 'M-Pesa',
  AIRTEL_KE: 'Airtel Money',
  MTN_RW: 'MTN MoMo',
  AIRTEL_RW: 'Airtel Money',
  CARD: 'Card',
};

export const CHANNEL_STATUS_LABEL: Record<ChannelStatus, string> = {
  NOT_REQUESTED: 'Not requested',
  PENDING: 'Pending',
  ACTIVE: 'Active',
  SUSPENDED: 'Suspended',
};

/* ---------------- Game management ---------------- */
export type ReleaseMode = 'AUTO' | 'MANUAL';
export type GameStatus = 'RELEASING' | 'IN_PLAY' | 'COMPLETED' | 'TIMED_OUT' | 'FAILED';
export type LedgerType = 'PURCHASE' | 'GAME' | 'REFUND' | 'FREE' | 'EXPIRY' | 'REVERSAL' | 'ADJUSTMENT';
export type PricingRuleType = 'BUNDLE' | 'HAPPY_HOUR';
export type FreeGameStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED' | 'USED';

export interface RuleRef {
  id: string;
  name: string;
  type: PricingRuleType;
}

export interface Game {
  id: string;
  billiardId: string;
  companyId: string;
  status: GameStatus;
  paymentId: string | null;
  batchId: string;
  free: boolean;
  unitPrice: number;
  currency: Currency;
  /** user name or 'AUTO' */
  releasedBy: string;
  /** user name | 'TABLE_BUTTON' | 'TIMEOUT' | null */
  endedBy: string | null;
  requestedAt: number;
  startedAt: number | null;
  endedAt: number | null;
  durationSec: number | null;
}

export interface LedgerEntry {
  id: string;
  billiardId: string;
  type: LedgerType;
  delta: number;
  balanceAfter: number;
  refType: string | null;
  refId: string | null;
  actor: string;
  at: number;
}

export interface PricingRule {
  id: string;
  billiardId: string;
  type: PricingRuleType;
  name: string;
  active: boolean;
  /** BUNDLE: n games for `price` */
  games: number | null;
  price: number | null;
  /** HAPPY_HOUR: ISO weekdays (Mon=1) and time window with a reduced unit price */
  daysOfWeek: number[] | null;
  startTime: string | null;
  endTime: string | null;
  unitPrice: number | null;
}

export interface Quote {
  games: number;
  unitPrice: number;
  amount: number;
  remainder: number;
  walletUsed: number;
  rule: RuleRef | null;
}

export interface FreeGameRequest {
  id: string;
  billiardId: string;
  companyId: string;
  requestedBy: string;
  requestedById: string;
  games: number;
  reason: string;
  validMinutes: number;
  status: FreeGameStatus;
  decidedBy: string | null;
  decisionNote: string | null;
  createdAt: number;
  decidedAt: number | null;
  expiresAt: number | null;
  remaining: number;
}

export interface GameStats {
  gamesToday: number;
  avgDurationSec: number;
  utilisationPct: number;
  outstandingCredits: number;
  daily: { day: number; games: number }[];
  heatmap: { billiardId: string; hours: number[] }[];
}

/* ---------------- M-Pesa (Daraja) ---------------- */
export type StkStatus = 'PENDING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
export interface StkRequest {
  id: string;
  billiardId: string;
  companyId: string;
  /** masked */
  msisdn: string;
  amount: number;
  games: number;
  currency: Currency;
  checkoutRequestId: string;
  status: StkStatus;
  resultCode: number | null;
  resultDesc: string | null;
  receipt: string | null;
  paymentId: string | null;
  initiatedBy: string;
  createdAt: number;
  completedAt: number | null;
  /** provider of the push (MPESA / MTN_RW / AIRTEL_RW) */
  channel?: PaymentChannel;
}

export type ShortcodeType = 'PAYBILL' | 'TILL';
export type MpesaEnvironment = 'SANDBOX' | 'PRODUCTION';
export interface MpesaCredential {
  /** shortcode id (list item); '' only for an unsaved draft */
  id: string;
  label: string;
  active: boolean;
  /** branches allowed to use this shortcode */
  branchIds: string[];
  tableCount: number;
  tables: { id: string; name: string }[];
  /** masked previews of saved secrets (first 4 + last 2 chars) */
  hints?: Partial<Record<'consumerKey' | 'consumerSecret' | 'passkey', string>>;
  companyId: string;
  configured: boolean;
  shortcode: string | null;
  shortcodeType: ShortcodeType;
  environment: MpesaEnvironment;
  hasConsumerKey: boolean;
  hasConsumerSecret: boolean;
  hasPasskey: boolean;
  callbackUrls: { stk: string; validation: string; confirmation: string } | null;
  urlsRegisteredAt: number | null;
  /** Per-company public callback host; null = platform default. */
  callbackBaseUrl?: string | null;
  updatedAt: number | null;
}

export type UnmatchedReason = 'UNKNOWN_REF' | 'NO_REF' | 'UNDERPAID' | 'STK_ORPHAN';
export type UnmatchedStatus = 'UNMATCHED' | 'ASSIGNED';
export interface UnmatchedPayment {
  id: string;
  companyId: string;
  transId: string;
  amount: number;
  currency: Currency;
  billRef: string | null;
  msisdn: string | null;
  payerName: string | null;
  shortcode: string | null;
  reason: UnmatchedReason;
  status: UnmatchedStatus;
  assignedBilliardId: string | null;
  paymentId: string | null;
  resolvedBy: string | null;
  resolvedAt: number | null;
  receivedAt: number;
}

// ---------- MTN MoMo / Airtel Money (Rwanda) ----------
export type MomoChannel = 'MTN_RW' | 'AIRTEL_RW';
export interface MomoCredential {
  id: string;
  companyId: string;
  channel: MomoChannel;
  label: string | null;
  active: boolean;
  merchantCode: string;
  environment: MpesaEnvironment;
  targetEnvironment: string | null;
  hasApiUser: boolean;
  hasApiKey: boolean;
  hasSubscriptionKey: boolean;
  hasClientId: boolean;
  hasClientSecret: boolean;
  hasSigningKey: boolean;
  signingEnabled: boolean;
  callbackUrls: { callback: string };
  callbackBaseUrl: string | null;
  /** last successful "Test connection" (ms); reset on every change */
  verifiedAt: number | null;
  updatedAt: number | null;
  branchIds: string[];
  tableCount: number;
  tables: { id: string; name: string; branchId: string | null; accountRef: string | null }[];
  /** masked previews of saved secrets (first 4 + last 2 chars) */
  hints?: Partial<Record<'apiUser' | 'apiKey' | 'subscriptionKey' | 'clientId' | 'clientSecret', string>>;
}
