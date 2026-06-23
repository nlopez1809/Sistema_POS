// ============================================================
// POS SYSTEM — Shared TypeScript Types
// ============================================================

export type UUID = string;

// --- Auth & Users ---
export type UserRole = 'superadmin' | 'admin' | 'manager' | 'cashier';

export interface User {
  id: UUID;
  company_id: UUID;
  branch_id?: UUID;
  auth_id?: UUID;
  name: string;
  email: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
}

// --- Company & Branch ---
export type Plan = 'free' | 'starter' | 'pro' | 'enterprise';

export interface Company {
  id: UUID;
  name: string;
  ruc?: string;
  address?: string;
  phone?: string;
  email?: string;
  logo_url?: string;
  qr_payment_url?: string;
  currency: string;
  timezone: string;
  plan: Plan;
  is_active: boolean;
}

export interface Branch {
  id: UUID;
  company_id: UUID;
  name: string;
  address?: string;
  phone?: string;
  is_active: boolean;
}

// --- Products & Inventory ---
export type ProductUnit = 'unit' | 'kg' | 'g' | 'l' | 'ml' | 'm' | 'box' | 'pack';

export interface Category {
  id: UUID;
  company_id: UUID;
  name: string;
  color: string;
  icon?: string;
  is_active: boolean;
}

export interface Product {
  id: UUID;
  company_id: UUID;
  category_id?: UUID;
  category?: Category;
  name: string;
  description?: string;
  sku?: string;
  barcode?: string;
  price: number;
  cost: number;
  unit: ProductUnit;
  image_url?: string;
  is_active: boolean;
  has_stock: boolean;
  stock?: Stock;
  created_at: string;
  updated_at: string;
}

export interface Stock {
  id: UUID;
  product_id: UUID;
  branch_id: UUID;
  quantity: number;
  min_quantity: number;
  max_quantity?: number;
  updated_at: string;
}

export interface StockMovement {
  id: UUID;
  product_id: UUID;
  branch_id: UUID;
  user_id?: UUID;
  sale_id?: UUID;
  type: 'sale' | 'purchase' | 'adjustment' | 'transfer' | 'void';
  quantity: number;
  before_qty: number;
  after_qty: number;
  notes?: string;
  created_at: string;
}

// --- Sales & POS ---
export type PaymentMethod = 'cash' | 'card' | 'qr' | 'transfer' | 'mixed';
export type SaleStatus = 'completed' | 'voided' | 'pending';

export interface Customer {
  id: UUID;
  company_id: UUID;
  name: string;
  email?: string;
  phone?: string;
  document?: string;
  address?: string;
  points: number;
}

export interface CartItem {
  product: Product;
  quantity: number;
  price: number;
  discount: number;
  subtotal: number;
}

export interface Sale {
  id: UUID;
  company_id: UUID;
  branch_id: UUID;
  cash_session_id?: UUID;
  user_id: UUID;
  customer_id?: UUID;
  customer?: Customer;
  ticket_number: string;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  paid_amount: number;
  change_amount: number;
  payment_method: PaymentMethod;
  status: SaleStatus;
  notes?: string;
  items?: SaleItem[];
  created_at: string;
}

export interface SaleItem {
  id: UUID;
  sale_id: UUID;
  product_id: UUID;
  name: string;
  price: number;
  cost: number;
  quantity: number;
  discount: number;
  subtotal: number;
}

// --- Cash Sessions ---
export type SessionStatus = 'open' | 'closed';

export interface CashSession {
  id: UUID;
  cash_register_id: UUID;
  user_id: UUID;
  opening_amount: number;
  closing_amount?: number;
  expected_amount?: number;
  difference?: number;
  status: SessionStatus;
  notes?: string;
  opened_at: string;
  closed_at?: string;
}

// --- Reports ---
export interface DailySummary {
  date: string;
  total_sales: number;
  total_revenue: number;
  total_items: number;
  avg_ticket: number;
  top_product?: string;
}

export interface ReportFilters {
  date_from: string;
  date_to: string;
  branch_id?: UUID;
  user_id?: UUID;
  payment_method?: PaymentMethod;
}

// --- API Responses ---
export interface ApiResponse<T> {
  data: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  count: number;
  page: number;
  limit: number;
}

// --- Store ---
export interface AppState {
  user: User | null;
  company: Company | null;
  branch: Branch | null;
  currentSession: CashSession | null;
  setUser: (user: User | null) => void;
  setCompany: (company: Company | null) => void;
  setBranch: (branch: Branch | null) => void;
  setCurrentSession: (session: CashSession | null) => void;
}

export interface CartState {
  items: CartItem[];
  customer: Customer | null;
  discount: number;
  addItem: (product: Product, quantity?: number) => void;
  removeItem: (productId: UUID) => void;
  updateQuantity: (productId: UUID, quantity: number) => void;
  updateDiscount: (productId: UUID, discount: number) => void;
  setCustomer: (customer: Customer | null) => void;
  setGlobalDiscount: (discount: number) => void;
  clearCart: () => void;
  totals: CartTotals;
}

export interface CartTotals {
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
}
