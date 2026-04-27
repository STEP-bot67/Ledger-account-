export interface Staff {
  id: string;
  name: string;
  phone: string;
  dataBalance: number;
  totalAllocated: number;
  createdAt: any;
}

export interface Transaction {
  id: string;
  reference: string;
  amount: number;
  type: 'fund' | 'transfer' | 'budget_increase' | 'advance';
  staffId?: string;
  timestamp: any;
  note?: string;
  gateway?: string;
  authorizedBy?: string;
  authorizerPosition?: string;
}

export interface AppSettings {
  budgetLimit: number;
  currency: string;
  closedMonths: string[];
}
