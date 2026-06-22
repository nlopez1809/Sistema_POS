import React, { useState } from 'react';
import {
  Truck, Plus, Search, X, Edit2, Save, Loader2,
  Phone, Mail, FileText, ShoppingCart, ArrowLeft,
  Package, DollarSign, Calendar
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAppStore } from '../../store';
import { supabase } from '../../lib/supabase';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

const fmt = (n: number) => `Bs ${n.toFixed(2)}`;

// ── Types ─────────────────────────────────────────────────────
interface Supplier {
  id: string;
  company_id: string;
  name: string;
  contact_name?: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
  is_active: boolean;
  created_at: string;
}

interface PurchaseItem {
  product_id: string;
  product_name: string;
  quantity: number;
  cost: number;
  subtotal: number;
}

interface Purchase {
  id: string;
  company_id: string;
  branch_id: string;
  supplier_id?: string;
  supplier?: Supplier;
  reference?: string;
  total: number;
  status: 'pending' | 'received' | 'cancelled';
  notes?: string;
  items?: PurchaseItem[];
  created_at: string;
}

// ── Supplier Modal ────────────────────────────────────────────
function SupplierModal({ supplier, companyId, onClose }: {
  supplier?: Supplier; companyId: string; onClose: () => void;
}) {
  const qc = useQueryClient();
  const isEdit = !!supplier;
  const [form, setForm] = useState({
    name: supplier?.name ?? '',
    contact_name: supplier?.contact_name ?? '',
    phone: supplier?.phone ?? '',
    email: supplier?.email ?? '',
    address: supplier?.address ?? '',
    notes: supplier?.notes ?? '',
  });
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const mutation = useMutation({
    mutationFn: async () => {
      if (isEdit) {
        const { error } = await supabase.from('suppliers').update(form).eq('id', supplier!.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('suppliers').insert({ ...form, company_id: companyId, is_active: true });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['suppliers'] });
      toast.success(isEdit ? 'Proveedor actualizado' : 'Proveedor creado');
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="sup-overlay" onClick={onClose}>
      <div className="sup-modal" onClick={e => e.stopPropagation()}>
        <div className="sup-modal-header">
          <h2>{isEdit ? 'Editar proveedor' : 'Nuevo proveedor'}</h2>
          <button onClick={onClose}><X size={18} /></button>
        </div>
        <div className="sup-modal-body">
          <div className="form-group">
            <label>Nombre de la empresa *</label>
            <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="Distribuidora ABC" autoFocus />
          </div>
          <div className="form-group">
            <label>Nombre del contacto</label>
            <input value={form.contact_name} onChange={e => set('contact_name', e.target.value)} placeholder="Juan Pérez" />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label><Phone size={11} /> Teléfono</label>
              <input value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="+591 70000000" />
            </div>
            <div className="form-group">
              <label><Mail size={11} /> Correo</label>
              <input type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="ventas@proveedor.com" />
            </div>
          </div>
          <div className="form-group">
            <label>Dirección</label>
            <input value={form.address} onChange={e => set('address', e.target.value)} placeholder="Av. Comercial #456" />
          </div>
          <div className="form-group">
            <label>Notas internas</label>
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={2} placeholder="Días de entrega, condiciones, etc." />
          </div>
        </div>
        <div className="sup-modal-footer">
          <button onClick={onClose} className="btn-ghost">Cancelar</button>
          <button onClick={() => mutation.mutate()} disabled={!form.name || mutation.isPending} className="btn-primary">
            {mutation.isPending ? <><Loader2 size={14} className="spin" />Guardando…</> : <><Save size={14} />Guardar</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── New Purchase Modal ────────────────────────────────────────
function PurchaseModal({ suppliers, companyId, branchId, userId, onClose }: {
  suppliers: Supplier[]; companyId: string; branchId: string; userId: string; onClose: () => void;
}) {
  const qc = useQueryClient();
  const [supplierId, setSupplierId] = useState('');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<Array<{ product_id: string; product_name: string; quantity: string; cost: string }>>([
    { product_id: '', product_name: '', quantity: '', cost: '' }
  ]);

  const { data: products = [] } = useQuery({
    queryKey: ['products-for-purchase', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('products').select('id, name, cost').eq('company_id', companyId).eq('is_active', true).order('name');
      return data ?? [];
    },
  });

  const updateItem = (i: number, k: string, v: string) => {
    setItems(prev => prev.map((item, idx) => {
      if (idx !== i) return item;
      const updated = { ...item, [k]: v };
      if (k === 'product_id') {
        const prod = products.find((p: any) => p.id === v);
        if (prod) updated.product_name = (prod as any).name;
        if (prod && !(item.cost)) updated.cost = String((prod as any).cost ?? '');
      }
      return updated;
    }));
  };

  const addItem = () => setItems(p => [...p, { product_id: '', product_name: '', quantity: '', cost: '' }]);
  const removeItem = (i: number) => setItems(p => p.filter((_, idx) => idx !== i));

  const total = items.reduce((a, it) => a + (parseFloat(it.quantity) || 0) * (parseFloat(it.cost) || 0), 0);
  const isValid = items.some(it => it.product_id && parseFloat(it.quantity) > 0 && parseFloat(it.cost) >= 0);

  const mutation = useMutation({
    mutationFn: async () => {
      const validItems = items.filter(it => it.product_id && parseFloat(it.quantity) > 0);

      // 1. Insert purchase
      const { data: purchase, error: pErr } = await supabase.from('purchases').insert({
        company_id: companyId,
        branch_id: branchId,
        supplier_id: supplierId || null,
        reference: reference || null,
        total,
        status: 'received',
        notes: notes || null,
      }).select().single();
      if (pErr) throw pErr;

      // 2. Insert items
      const { error: iErr } = await supabase.from('purchase_items').insert(
        validItems.map(it => ({
          purchase_id: purchase.id,
          product_id: it.product_id,
          product_name: it.product_name,
          quantity: parseFloat(it.quantity),
          cost: parseFloat(it.cost),
          subtotal: parseFloat(it.quantity) * parseFloat(it.cost),
        }))
      );
      if (iErr) throw iErr;

      // 3. Update stock for each item
      for (const it of validItems) {
        const qty = parseFloat(it.quantity);
        const { data: stock } = await supabase.from('stock').select('quantity').eq('product_id', it.product_id).eq('branch_id', branchId).single();
        const before = stock?.quantity ?? 0;
        await supabase.from('stock').upsert({ product_id: it.product_id, branch_id: branchId, quantity: before + qty });
        await supabase.from('stock_movements').insert({
          product_id: it.product_id, branch_id: branchId, user_id: userId,
          type: 'purchase', quantity: qty, before_qty: before, after_qty: before + qty,
          notes: `Compra ${purchase.id.slice(0, 8)}`,
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['purchases', 'products'] });
      toast.success('Compra registrada y stock actualizado');
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="sup-overlay" onClick={onClose}>
      <div className="sup-modal wide" onClick={e => e.stopPropagation()}>
        <div className="sup-modal-header">
          <h2>Registrar compra</h2>
          <button onClick={onClose}><X size={18} /></button>
        </div>
        <div className="sup-modal-body">
          <div className="form-row">
            <div className="form-group">
              <label>Proveedor</label>
              <select value={supplierId} onChange={e => setSupplierId(e.target.value)}>
                <option value="">Sin proveedor</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Nro. factura / referencia</label>
              <input value={reference} onChange={e => setReference(e.target.value)} placeholder="FAC-001" />
            </div>
          </div>

          <div className="purchase-items-header">
            <span>Producto</span><span>Cantidad</span><span>Costo unit.</span><span>Subtotal</span><span></span>
          </div>
          {items.map((item, i) => (
            <div key={i} className="purchase-item-row">
              <select value={item.product_id} onChange={e => updateItem(i, 'product_id', e.target.value)}>
                <option value="">Seleccionar…</option>
                {products.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <input type="number" value={item.quantity} onChange={e => updateItem(i, 'quantity', e.target.value)} placeholder="0" min="0" step="1" />
              <input type="number" value={item.cost} onChange={e => updateItem(i, 'cost', e.target.value)} placeholder="0.00" min="0" step="0.50" />
              <span className="item-subtotal">
                {item.quantity && item.cost ? fmt((parseFloat(item.quantity) || 0) * (parseFloat(item.cost) || 0)) : '—'}
              </span>
              {items.length > 1 && (
                <button onClick={() => removeItem(i)} className="remove-item-btn"><X size={12} /></button>
              )}
            </div>
          ))}
          <button onClick={addItem} className="add-item-btn"><Plus size={13} /> Agregar producto</button>

          <div className="purchase-total-row">
            <span>Total de la compra</span>
            <span className="purchase-total-value">{fmt(total)}</span>
          </div>

          <div className="form-group">
            <label>Notas</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Observaciones de la compra…" />
          </div>
        </div>
        <div className="sup-modal-footer">
          <button onClick={onClose} className="btn-ghost">Cancelar</button>
          <button onClick={() => mutation.mutate()} disabled={!isValid || mutation.isPending} className="btn-primary">
            {mutation.isPending ? <><Loader2 size={14} className="spin" />Registrando…</> : <><ShoppingCart size={14} />Registrar compra</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Suppliers Page ───────────────────────────────────────
export default function SuppliersPage() {
  const { company, branch, user } = useAppStore();
  const [tab, setTab] = useState<'suppliers' | 'purchases'>('suppliers');
  const [search, setSearch] = useState('');
  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
  const [editSupplier, setEditSupplier] = useState<Supplier | undefined>();

  const { data: suppliers = [], isLoading: loadingSuppliers } = useQuery({
    queryKey: ['suppliers', company?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('suppliers').select('*').eq('company_id', company!.id).order('name');
      if (error) throw error;
      return data as Supplier[];
    },
    enabled: !!company?.id,
  });

  const { data: purchases = [], isLoading: loadingPurchases } = useQuery({
    queryKey: ['purchases', company?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('purchases')
        .select('*, supplier:suppliers(name), items:purchase_items(*)')
        .eq('company_id', company!.id)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as Purchase[];
    },
    enabled: !!company?.id,
  });

  const filteredSuppliers = suppliers.filter(s =>
    !search || s.name.toLowerCase().includes(search.toLowerCase()) || s.phone?.includes(search)
  );

  const totalPurchasesMonth = purchases
    .filter(p => new Date(p.created_at) >= new Date(new Date().getFullYear(), new Date().getMonth(), 1))
    .reduce((a, p) => a + p.total, 0);

  return (
    <div className="sup-layout">
      <style>{supStyles}</style>

      <div className="sup-header">
        <div className="sup-title">
          <Truck size={20} />
          <h1>Proveedores y Compras</h1>
        </div>
        <div className="sup-actions">
          <button onClick={() => setShowPurchaseModal(true)} className="btn-secondary">
            <ShoppingCart size={15} /> Nueva compra
          </button>
          <button onClick={() => { setEditSupplier(undefined); setShowSupplierModal(true); }} className="btn-primary">
            <Plus size={15} /> Nuevo proveedor
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="sup-summary">
        <div className="sup-summary-card">
          <Truck size={16} color="var(--c-primary)" />
          <div>
            <span className="sum-value">{suppliers.length}</span>
            <span className="sum-label">Proveedores activos</span>
          </div>
        </div>
        <div className="sup-summary-card">
          <ShoppingCart size={16} color="#34d399" />
          <div>
            <span className="sum-value">{purchases.length}</span>
            <span className="sum-label">Compras registradas</span>
          </div>
        </div>
        <div className="sup-summary-card">
          <DollarSign size={16} color="#f59e0b" />
          <div>
            <span className="sum-value">{fmt(totalPurchasesMonth)}</span>
            <span className="sum-label">Compras este mes</span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="sup-tabs">
        <button onClick={() => setTab('suppliers')} className={`tab-btn ${tab === 'suppliers' ? 'active' : ''}`}>
          <Truck size={14} /> Proveedores
        </button>
        <button onClick={() => setTab('purchases')} className={`tab-btn ${tab === 'purchases' ? 'active' : ''}`}>
          <Package size={14} /> Historial de compras
        </button>
      </div>

      {tab === 'suppliers' && (
        <>
          <div className="sup-search">
            <Search size={14} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar proveedor…" />
            {search && <button onClick={() => setSearch('')}><X size={12} /></button>}
          </div>

          {loadingSuppliers ? (
            <div className="sup-loading"><Loader2 size={20} className="spin" /> Cargando…</div>
          ) : filteredSuppliers.length === 0 ? (
            <div className="sup-empty">
              <Truck size={40} strokeWidth={1} color="#2a2a38" />
              <p>{search ? `Sin resultados` : 'No hay proveedores registrados'}</p>
              {!search && <button onClick={() => setShowSupplierModal(true)} className="btn-primary">Agregar primer proveedor</button>}
            </div>
          ) : (
            <div className="sup-grid">
              {filteredSuppliers.map(s => (
                <div key={s.id} className="sup-card">
                  <div className="sup-card-top">
                    <div className="sup-icon"><Truck size={18} /></div>
                    <div className="sup-card-info">
                      <span className="sup-card-name">{s.name}</span>
                      {s.contact_name && <span className="sup-card-contact">{s.contact_name}</span>}
                    </div>
                    <button onClick={() => { setEditSupplier(s); setShowSupplierModal(true); }} className="action-btn">
                      <Edit2 size={13} />
                    </button>
                  </div>
                  <div className="sup-card-meta">
                    {s.phone && <span><Phone size={11} />{s.phone}</span>}
                    {s.email && <span><Mail size={11} />{s.email}</span>}
                  </div>
                  {s.notes && <p className="sup-card-notes">{s.notes}</p>}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {tab === 'purchases' && (
        <div className="purchases-table-wrap">
          {loadingPurchases ? (
            <div className="sup-loading"><Loader2 size={20} className="spin" /> Cargando…</div>
          ) : purchases.length === 0 ? (
            <div className="sup-empty">
              <Package size={40} strokeWidth={1} color="#2a2a38" />
              <p>No hay compras registradas</p>
              <button onClick={() => setShowPurchaseModal(true)} className="btn-primary">Registrar primera compra</button>
            </div>
          ) : (
            <table className="purchases-table">
              <thead>
                <tr>
                  <th><Calendar size={12} /> Fecha</th>
                  <th>Proveedor</th>
                  <th>Referencia</th>
                  <th className="center">Productos</th>
                  <th className="right">Total</th>
                  <th className="center">Estado</th>
                </tr>
              </thead>
              <tbody>
                {purchases.map(p => (
                  <tr key={p.id}>
                    <td className="muted">{format(new Date(p.created_at), 'dd MMM yyyy HH:mm', { locale: es })}</td>
                    <td>{p.supplier?.name ?? <span className="muted">—</span>}</td>
                    <td className="mono muted">{p.reference ?? '—'}</td>
                    <td className="center">{p.items?.length ?? 0}</td>
                    <td className="right bold">{fmt(p.total)}</td>
                    <td className="center">
                      <span className={`status-tag ${p.status}`}>
                        {p.status === 'received' ? 'Recibida' : p.status === 'pending' ? 'Pendiente' : 'Cancelada'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {showSupplierModal && (
        <SupplierModal
          supplier={editSupplier}
          companyId={company!.id}
          onClose={() => setShowSupplierModal(false)}
        />
      )}
      {showPurchaseModal && company && branch && user && (
        <PurchaseModal
          suppliers={suppliers}
          companyId={company.id}
          branchId={branch.id}
          userId={user.id}
          onClose={() => setShowPurchaseModal(false)}
        />
      )}
    </div>
  );
}

const supStyles = `
  .sup-layout { padding: 24px; background: #0f0f11; min-height: 100%; color: #e8e6e1; font-family: 'DM Sans','Inter',sans-serif; display: flex; flex-direction: column; gap: 18px; }
  .sup-header { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; }
  .sup-title { display: flex; align-items: center; gap: 10px; }
  .sup-title h1 { font-size: 20px; font-weight: 600; margin: 0; }
  .sup-actions { display: flex; gap: 8px; }
  .btn-primary { display: flex; align-items: center; gap: 6px; background: var(--c-primary); border: none; border-radius: 8px; color: #fff; font-size: 13px; font-weight: 500; padding: 8px 14px; cursor: pointer; transition: background .15s; }
  .btn-primary:hover:not(:disabled) { background: var(--c-primary-hover); }
  .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
  .btn-secondary { display: flex; align-items: center; gap: 6px; background: #1a1a1f; border: 1px solid #2a2a30; border-radius: 8px; color: #9997a0; font-size: 13px; font-weight: 500; padding: 8px 14px; cursor: pointer; transition: all .15s; }
  .btn-secondary:hover { border-color: #3a3a45; color: #e8e6e1; }
  .btn-ghost { display: flex; align-items: center; gap: 6px; background: none; border: 1px solid #2a2a30; border-radius: 8px; color: #9997a0; font-size: 13px; padding: 8px 14px; cursor: pointer; }

  .sup-summary { display: flex; gap: 12px; flex-wrap: wrap; }
  .sup-summary-card { display: flex; align-items: center; gap: 12px; background: #131318; border: 1px solid #1e1e25; border-radius: 12px; padding: 14px 18px; }
  .sum-value { display: block; font-size: 20px; font-weight: 700; color: #e8e6e1; }
  .sum-label { display: block; font-size: 11px; color: #4a4a55; }

  .sup-tabs { display: flex; gap: 4px; border-bottom: 1px solid #1e1e25; }
  .tab-btn { display: flex; align-items: center; gap: 6px; background: none; border: none; border-bottom: 2px solid transparent; padding: 9px 16px; color: #6b6a65; font-size: 13px; cursor: pointer; margin-bottom: -1px; transition: all .15s; }
  .tab-btn.active { color: var(--c-primary-text); border-bottom-color: var(--c-primary); }
  .tab-btn:hover:not(.active) { color: #e8e6e1; }

  .sup-search { display: flex; align-items: center; gap: 8px; background: #1a1a1f; border: 1px solid #2a2a30; border-radius: 8px; padding: 0 12px; max-width: 380px; color: #6b6a65; }
  .sup-search input { background: none; border: none; color: #e8e6e1; font-size: 13px; padding: 9px 0; outline: none; flex: 1; }
  .sup-search input::placeholder { color: #3a3a42; }
  .sup-search button { background: none; border: none; color: #4a4a55; cursor: pointer; }

  .sup-loading, .sup-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; color: #4a4a55; padding: 60px; font-size: 13px; }

  .sup-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; }
  .sup-card { background: #131318; border: 1px solid #1e1e25; border-radius: 12px; padding: 16px; display: flex; flex-direction: column; gap: 10px; transition: border-color .15s; }
  .sup-card:hover { border-color: #2a2a35; }
  .sup-card-top { display: flex; align-items: center; gap: 10px; }
  .sup-icon { width: 36px; height: 36px; border-radius: 8px; background: var(--c-primary)22; color: var(--c-primary-text); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .sup-card-info { flex: 1; min-width: 0; }
  .sup-card-name { display: block; font-size: 14px; font-weight: 500; color: #e8e6e1; }
  .sup-card-contact { display: block; font-size: 12px; color: #4a4a55; }
  .action-btn { background: none; border: 1px solid #2a2a30; border-radius: 6px; color: #6b6a65; cursor: pointer; padding: 5px 7px; transition: all .1s; display: flex; align-items: center; }
  .action-btn:hover { border-color: var(--c-primary); color: var(--c-primary-text); }
  .sup-card-meta { display: flex; gap: 12px; flex-wrap: wrap; }
  .sup-card-meta span { display: flex; align-items: center; gap: 5px; font-size: 12px; color: #6b6a65; }
  .sup-card-notes { font-size: 11px; color: #3a3a42; font-style: italic; border-top: 1px solid #1e1e25; padding-top: 8px; }

  .purchases-table-wrap { overflow: auto; border-radius: 12px; border: 1px solid #1e1e25; }
  .purchases-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .purchases-table thead { background: #131318; }
  .purchases-table th { padding: 10px 14px; text-align: left; font-weight: 500; color: #4a4a55; border-bottom: 1px solid #1e1e25; white-space: nowrap; }
  .purchases-table th.right, .purchases-table td.right { text-align: right; }
  .purchases-table th.center, .purchases-table td.center { text-align: center; }
  .purchases-table tbody tr { border-bottom: 1px solid #1a1a1f; transition: background .1s; }
  .purchases-table tbody tr:hover { background: #131318; }
  .purchases-table td { padding: 11px 14px; vertical-align: middle; }
  .muted { color: #4a4a55; font-size: 12px; }
  .mono { font-family: monospace; }
  .bold { font-weight: 600; color: #e8e6e1; }
  .status-tag { font-size: 11px; padding: 3px 9px; border-radius: 20px; font-weight: 500; }
  .status-tag.received  { background: #0f2d1a; color: #22c55e; }
  .status-tag.pending   { background: #1a1a03; color: #d97706; }
  .status-tag.cancelled { background: #1a1a1f; color: #4a4a55; }

  /* Modals */
  .sup-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.75); display: flex; align-items: center; justify-content: center; z-index: 100; }
  .sup-modal { background: #1a1a1f; border: 1px solid #2a2a30; border-radius: 16px; width: 480px; max-width: 95vw; max-height: 90vh; overflow-y: auto; display: flex; flex-direction: column; }
  .sup-modal.wide { width: 640px; }
  .sup-modal-header { display: flex; align-items: center; justify-content: space-between; padding: 20px 24px 16px; border-bottom: 1px solid #1e1e25; position: sticky; top: 0; background: #1a1a1f; z-index: 1; }
  .sup-modal-header h2 { font-size: 16px; font-weight: 600; }
  .sup-modal-header button { background: none; border: none; color: #6b6a65; cursor: pointer; }
  .sup-modal-body { padding: 20px 24px; display: flex; flex-direction: column; gap: 14px; }
  .sup-modal-footer { padding: 16px 24px; border-top: 1px solid #1e1e25; display: flex; justify-content: flex-end; gap: 8px; position: sticky; bottom: 0; background: #1a1a1f; }
  .form-group { display: flex; flex-direction: column; gap: 5px; }
  .form-group label { font-size: 12px; color: #6b6a65; display: flex; align-items: center; gap: 4px; }
  .form-group input, .form-group select, .form-group textarea { background: #131318; border: 1px solid #2a2a30; border-radius: 8px; padding: 9px 12px; color: #e8e6e1; font-size: 13px; outline: none; transition: border-color .15s; width: 100%; }
  .form-group input:focus, .form-group select:focus, .form-group textarea:focus { border-color: var(--c-primary); }
  .form-group select option { background: #1a1a1f; }
  .form-group textarea { resize: vertical; }
  .form-row { display: flex; gap: 12px; }
  .form-row .form-group { flex: 1; }

  .purchase-items-header { display: grid; grid-template-columns: 1fr 90px 100px 90px 28px; gap: 8px; font-size: 11px; color: #4a4a55; padding: 0 2px; }
  .purchase-item-row { display: grid; grid-template-columns: 1fr 90px 100px 90px 28px; gap: 8px; align-items: center; }
  .purchase-item-row input, .purchase-item-row select { background: #131318; border: 1px solid #2a2a30; border-radius: 6px; padding: 7px 10px; color: #e8e6e1; font-size: 13px; outline: none; width: 100%; }
  .purchase-item-row input:focus, .purchase-item-row select:focus { border-color: var(--c-primary); }
  .item-subtotal { font-size: 12px; color: var(--c-primary-text); font-weight: 600; text-align: right; }
  .remove-item-btn { background: none; border: 1px solid #2a2a30; border-radius: 5px; color: #4a4a55; cursor: pointer; padding: 4px; display: flex; align-items: center; justify-content: center; transition: all .1s; }
  .remove-item-btn:hover { border-color: #ef4444; color: #ef4444; }
  .add-item-btn { display: flex; align-items: center; gap: 5px; background: none; border: 1px dashed #2a2a30; border-radius: 7px; color: var(--c-primary); font-size: 12px; padding: 7px 12px; cursor: pointer; transition: all .1s; width: fit-content; }
  .add-item-btn:hover { border-color: var(--c-primary); background: var(--c-primary)10; }
  .purchase-total-row { display: flex; justify-content: space-between; align-items: center; background: #131318; border-radius: 8px; padding: 12px 14px; }
  .purchase-total-row span:first-child { font-size: 13px; color: #6b6a65; }
  .purchase-total-value { font-size: 20px; font-weight: 700; color: var(--c-primary-text); }

  .spin { animation: spin 1s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
`;
