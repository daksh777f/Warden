import type {
  Approval,
  Invoice,
  Mandate,
  PolicyDecision,
  Purchase,
  Subscription,
  Transaction,
} from '@/lib/types';
import { DEFAULT_MANDATE } from '@/lib/policy/mandate';

export interface DB {
  purchases: Purchase[];
  subscriptions: Subscription[];
  approvals: Approval[];
  transactions: Transaction[];
  invoices: Invoice[];
  mandate?: Mandate;
  agentMandate?: Mandate;
  policyDecisions: PolicyDecision[];
}

export const EMPTY_DB: DB = {
  purchases: [],
  subscriptions: [],
  approvals: [],
  transactions: [],
  invoices: [],
  mandate: DEFAULT_MANDATE,
  agentMandate: undefined,
  policyDecisions: [],
};

/**
 * Every backend implements this. The file-backed driver is the default so
 * the app runs with zero configuration; Supabase takes over automatically
 * when its env vars are present.
 */
export interface StoreDriver {
  readonly name: 'file' | 'supabase';
  read(): Promise<DB>;
  insertPurchase(row: Purchase): Promise<Purchase>;
  insertSubscription(row: Subscription): Promise<Subscription>;
  insertApproval(row: Approval): Promise<Approval>;
  insertTransaction(row: Transaction): Promise<Transaction>;
  insertInvoice(row: Invoice): Promise<Invoice>;
  insertPolicyDecision(row: PolicyDecision): Promise<PolicyDecision>;
  updateApproval(id: string, patch: Partial<Approval>): Promise<Approval | null>;
  updatePurchase(id: string, patch: Partial<Purchase>): Promise<Purchase | null>;
  updateSubscription(id: string, patch: Partial<Subscription>): Promise<Subscription | null>;
  updateTransaction(id: string, patch: Partial<Transaction>): Promise<Transaction | null>;
  updateMandate(mandate: Mandate): Promise<Mandate>;
  reset(seed: DB): Promise<void>;
}

export const COMPANY_ID = 'company_demo';
