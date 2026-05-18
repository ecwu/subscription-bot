export type BillingCycle =
  | "monthly"
  | "yearly"
  | "quarterly"
  | "weekly"
  | "custom"
  | "interval";

export interface BillingInterval {
  unit: "day" | "week";
  count: number;
}

export interface Subscription {
  id: string;
  name: string;
  price?: number;
  currency?: string;
  billingCycle: BillingCycle;
  billingInterval?: BillingInterval;
  nextBillingDate: string; // ISO 8601 date (YYYY-MM-DD)
  billingAnchorDay?: number; // Original billing day of month for month-like cycles
  category?: string;
  note?: string;
  createdAt: string;
  updatedAt: string;
}

export interface StoredSubscription {
  id: string;
  encryptedPayload: string; // base64url-encoded encrypted JSON
  nextBillingDate: string;
  billingCycle: BillingCycle;
  billingInterval?: BillingInterval;
  billingAnchorDay?: number;
  createdAt: string;
  updatedAt: string;
}
