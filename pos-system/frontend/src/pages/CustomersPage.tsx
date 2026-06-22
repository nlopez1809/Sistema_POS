import React, { useState } from 'react';
import {
  Users, Plus, Search, X, Edit2, Eye, Save, Loader2,
  Phone, Mail, FileText, Star, ShoppingBag, ArrowLeft
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAppStore } from '../../store';
import { supabase } from '../../lib/supabase';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import type { Customer } from '../../../shared/types';

const fmt = (n: number) => `Bs ${n.toFixed(2)}`;

// ── Customer Form Modal ───────────────────────────────────────
function CustomerModal({ customer, companyId, onClose }: {
  customer?: Customer; companyId: string; onClose: () => void;
}) {
  const qc = useQueryClient();
  const isEdit = !!customer;
  const [form, setForm] = useState({
    name: customer?.name ?? '',
    email: customer?.email ?? '',
    phone: customer?.phone ?? '',
    document: customer?.document ?? '',
    address: customer?.address ?? '',
  });
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const mutation = useMutation({
    mutationFn: async () => {
      if (isEdit) {
        const { error } = await supabase.from('customers').update(form).eq('id', customer!.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('customers').insert({ ...form, company_id: companyId });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customers'] });
      toast.success(isEdit ? 'Cliente actualizado' : 'Cliente creado');
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="cust-overlay" onClick={onClose}>
      <div className="cust-modal" onClick={e => e.stopPropagation()}>
        <div className="cust-modal-header">
          <h2>{isEdit ? 'Editar cliente' : 'Nuevo cliente'}</h2>
          <button onClick={onClose}><X size={18} /></button>
        </div>
        <div className="cust-modal-body">
          <div className="form-group">
            <label>Nombre completo *</label>
            <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="María López" autoFocus />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label><Phone size={11} className="label-icon" /> Teléfono</label>
              <input value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="+591 70123456" />
            </div>
            <div className="form-group">
              <label><Mail size={11} className="label-icon" /> Correo</label>
              <input type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="cliente@email.com" />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label><FileText size={11} className="label-icon" /> CI / NIT</label>
              <input value={form.document} onChange={e => set('document', e.target.value)} placeholder="1234567" />
            </div>
            <div className="form-group">
              <label>Dirección</label>
              <input value={form.address} onChange={e => set('address', e.target.value)} placeholder="Av. ejemplo #123" />
            </div>
          </div>
        </div>
        <div className="cust-modal-footer">
          <button onClick={onClose} className="btn-ghost">Cancelar</button>
          <button onClick={() => mutation.mutate()} disabled={!form.name || mutation.isPending} className="btn-primary">
            {mutation.isPending ? <><Loader2 size={14} className="spin" />Guardando…</> : <><Save size={14} />Guardar</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Customer Detail View ──────────────────────────────────────
function CustomerDetail({ customer, onBack }: { customer: Customer; onBack: () => void }) {
  const { company } = useAppStore();

  const { data: purchases = [], isLoading } = useQuery({
    queryKey: ['customer-purchases', customer.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sales')
        .select('*, items:sale_items(name, quantity, subtotal)')
        .eq('customer_id', customer.id)
        .eq('status', 'completed')
        .order('created_at', { ascending: false })
        .limit(30);
      if (error) throw error;
      return data ?? [];
    },
  });

  const totalSpent = purchases.reduce((a, s) => a + s.total, 0);
  const avgTicket = purchases.length > 0 ? totalSpent / purchases.length : 0;

  return (
    <div className="cust-detail">
      <div className="cust-detail-header">
        <button onClick={onBack} className="back-btn"><ArrowLeft size={16} /> Volver</button>
      </div>

      <div className="cust-detail-hero">
        <div className="cust-avatar-lg">{customer.name.slice(0, 2).toUpperCase()}</div>
        <div>
          <h2 className="cust-detail-name">{customer.name}</h2>
          <div className="cust-detail-meta">
            {customer.phone && <span><Phone size={12} />{customer.phone}</span>}
            {customer.email && <span><Mail size={12} />{customer.email}</span>}
            {customer.document && <span><FileText size={12} />CI: {customer.document}</span>}
          </div>
        </div>
        <div className="cust-points-badge">
          <Star size={14} color="#f59e0b" />
          <span>{customer.points} pts</span>
        </div>
      </div>

      <div className="cust-detail-stats">
        <div className="detail-stat">
          <span className="detail-stat-label">Total gastado</span>
          <span className="detail-stat-value">{fmt(totalSpent)}</span>
        </div>
        <div className="detail-stat">
          <span className="detail-stat-label">Visitas</span>
          <span className="detail-stat-value">{purchases.length}</span>
        </div>
        <div className="detail-stat">
          <span className="detail-stat-label">Ticket promedio</span>
          <span className="detail-stat-value">{fmt(avgTicket)}</span>
        </div>
      </div>

      <h3 className="section-title">Historial de compras</h3>
      {isLoading ? (
        <div className="cust-loading"><Loader2 size={18} className="spin" /> Cargando…</div>
      ) : purchases.length === 0 ? (
        <div className="cust-empty"><ShoppingBag size={32} strokeWidth={1} /><p>Sin compras registradas</p></div>
      ) : (
        <div className="purchase-list">
          {purchases.map(p => (
            <div key={p.id} className="purchase-row">
              <div className="purchase-info">
                <span className="purchase-ticket">{p.ticket_number}</span>
                <span className="purchase-date">{format(new Date(p.created_at), "d MMM yyyy 'a las' HH:mm", { locale: es })}</span>
                <span className="purchase-items">{p.items?.length ?? 0} producto(s)</span>
              </div>
              <div className="purchase-right">
                <span className={`purchase-method ${p.payment_method}`}>
                  {p.payment_method === 'cash' ? 'Efectivo' : p.payment_method === 'card' ? 'Tarjeta' : 'QR'}
                </span>
                <span className="purchase-total">{fmt(p.total)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Customers Page ───────────────────────────────────────
export default function CustomersPage() {
  const { company } = useAppStore();
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editCustomer, setEditCustomer] = useState<Customer | undefined>();
  const [viewCustomer, setViewCustomer] = useState<Customer | undefined>();

  const { data: customers = [], isLoading } = useQuery({
    queryKey: ['customers', company?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .eq('company_id', company!.id)
        .order('name');
      if (error) throw error;
      return data as Customer[];
    },
    enabled: !!company?.id,
  });

  const filtered = customers.filter(c =>
    !search || c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.phone?.includes(search) || c.document?.includes(search)
  );

  if (viewCustomer) {
    return (
      <div className="cust-layout">
        <style>{custStyles}</style>
        <CustomerDetail customer={viewCustomer} onBack={() => setViewCustomer(undefined)} />
      </div>
    );
  }

  return (
    <div className="cust-layout">
      <style>{custStyles}</style>

      <div className="cust-header">
        <div className="cust-title">
          <Users size={20} />
          <h1>Clientes</h1>
          <span className="cust-count">{customers.length}</span>
        </div>
        <button onClick={() => { setEditCustomer(undefined); setShowModal(true); }} className="btn-primary">
          <Plus size={16} /> Nuevo cliente
        </button>
      </div>

      <div className="cust-search">
        <Search size={14} />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por nombre, teléfono o CI…"
        />
        {search && <button onClick={() => setSearch('')}><X size={12} /></button>}
      </div>

      {isLoading ? (
        <div className="cust-loading"><Loader2 size={22} className="spin" /> Cargando…</div>
      ) : filtered.length === 0 ? (
        <div className="cust-empty">
          <Users size={40} strokeWidth={1} color="#2a2a38" />
          <p>{search ? `Sin resultados para "${search}"` : 'Aún no hay clientes registrados'}</p>
          {!search && <button onClick={() => setShowModal(true)} className="btn-primary">Agregar primer cliente</button>}
        </div>
      ) : (
        <div className="cust-table-wrap">
          <table className="cust-table">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Teléfono</th>
                <th>CI / NIT</th>
                <th className="center"><Star size={12} /> Puntos</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => (
                <tr key={c.id}>
                  <td>
                    <div className="cust-cell">
                      <div className="cust-avatar">{c.name.slice(0, 2).toUpperCase()}</div>
                      <div>
                        <div className="cust-name">{c.name}</div>
                        {c.email && <div className="cust-email">{c.email}</div>}
                      </div>
                    </div>
                  </td>
                  <td className="muted">{c.phone ?? '—'}</td>
                  <td className="muted mono">{c.document ?? '—'}</td>
                  <td className="center">
                    {c.points > 0
                      ? <span className="points-badge"><Star size={10} />{c.points}</span>
                      : <span className="muted">—</span>}
                  </td>
                  <td className="actions-cell">
                    <button onClick={() => setViewCustomer(c)} className="action-btn" title="Ver historial"><Eye size={14} /></button>
                    <button onClick={() => { setEditCustomer(c); setShowModal(true); }} className="action-btn" title="Editar"><Edit2 size={14} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <CustomerModal
          customer={editCustomer}
          companyId={company!.id}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
}

const custStyles = `
  .cust-layout {
    padding: 24px; background: #0f0f11; min-height: 100%;
    color: #e8e6e1; font-family: 'DM Sans','Inter',sans-serif;
    display: flex; flex-direction: column; gap: 18px;
  }
  .cust-header { display: flex; align-items: center; justify-content: space-between; }
  .cust-title { display: flex; align-items: center; gap: 10px; }
  .cust-title h1 { font-size: 20px; font-weight: 600; margin: 0; }
  .cust-count { font-size: 12px; background: #1a1a1f; border: 1px solid #2a2a30; border-radius: 20px; padding: 2px 10px; color: #6b6a65; }

  .btn-primary { display: flex; align-items: center; gap: 6px; background: #5c6df0; border: none; border-radius: 8px; color: #fff; font-size: 13px; font-weight: 500; padding: 8px 14px; cursor: pointer; transition: background .15s; }
  .btn-primary:hover:not(:disabled) { background: #4f60e6; }
  .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
  .btn-ghost { display: flex; align-items: center; gap: 6px; background: none; border: 1px solid #2a2a30; border-radius: 8px; color: #9997a0; font-size: 13px; padding: 8px 14px; cursor: pointer; }

  .cust-search { display: flex; align-items: center; gap: 8px; background: #1a1a1f; border: 1px solid #2a2a30; border-radius: 8px; padding: 0 12px; max-width: 420px; color: #6b6a65; }
  .cust-search input { background: none; border: none; color: #e8e6e1; font-size: 13px; padding: 9px 0; outline: none; flex: 1; }
  .cust-search input::placeholder { color: #3a3a42; }
  .cust-search button { background: none; border: none; color: #4a4a55; cursor: pointer; }

  .cust-loading, .cust-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; color: #4a4a55; padding: 60px; font-size: 13px; }

  .cust-table-wrap { overflow: auto; border-radius: 12px; border: 1px solid #1e1e25; }
  .cust-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .cust-table thead { background: #131318; }
  .cust-table th { padding: 10px 14px; text-align: left; font-weight: 500; color: #4a4a55; border-bottom: 1px solid #1e1e25; white-space: nowrap; }
  .cust-table th.center { text-align: center; }
  .cust-table tbody tr { border-bottom: 1px solid #1a1a1f; transition: background .1s; }
  .cust-table tbody tr:hover { background: #131318; }
  .cust-table td { padding: 12px 14px; vertical-align: middle; }
  .cust-table td.center { text-align: center; }
  .muted { color: #4a4a55; font-size: 12px; }
  .mono { font-family: monospace; }

  .cust-cell { display: flex; align-items: center; gap: 10px; }
  .cust-avatar { width: 34px; height: 34px; border-radius: 8px; background: #5c6df022; color: #a5b4fc; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; flex-shrink: 0; border: 1px solid #5c6df033; }
  .cust-name { font-size: 13px; font-weight: 500; color: #e8e6e1; }
  .cust-email { font-size: 11px; color: #4a4a55; }

  .points-badge { display: inline-flex; align-items: center; gap: 4px; background: #1a1a03; color: #d97706; border-radius: 20px; padding: 2px 8px; font-size: 11px; font-weight: 600; }

  .actions-cell { display: flex; gap: 4px; justify-content: flex-end; }
  .action-btn { background: none; border: 1px solid #2a2a30; border-radius: 6px; color: #6b6a65; cursor: pointer; padding: 5px 7px; transition: all .1s; display: flex; align-items: center; }
  .action-btn:hover { border-color: #5c6df0; color: #a5b4fc; }

  /* Modal */
  .cust-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.75); display: flex; align-items: center; justify-content: center; z-index: 100; }
  .cust-modal { background: #1a1a1f; border: 1px solid #2a2a30; border-radius: 16px; width: 480px; max-width: 95vw; display: flex; flex-direction: column; }
  .cust-modal-header { display: flex; align-items: center; justify-content: space-between; padding: 20px 24px 16px; border-bottom: 1px solid #1e1e25; }
  .cust-modal-header h2 { font-size: 16px; font-weight: 600; }
  .cust-modal-header button { background: none; border: none; color: #6b6a65; cursor: pointer; }
  .cust-modal-body { padding: 20px 24px; display: flex; flex-direction: column; gap: 14px; }
  .cust-modal-footer { padding: 16px 24px; border-top: 1px solid #1e1e25; display: flex; justify-content: flex-end; gap: 8px; }
  .form-group { display: flex; flex-direction: column; gap: 5px; }
  .form-group label { font-size: 12px; color: #6b6a65; display: flex; align-items: center; gap: 4px; }
  .form-group input { background: #131318; border: 1px solid #2a2a30; border-radius: 8px; padding: 9px 12px; color: #e8e6e1; font-size: 13px; outline: none; transition: border-color .15s; }
  .form-group input:focus { border-color: #5c6df0; }
  .form-row { display: flex; gap: 12px; }
  .form-row .form-group { flex: 1; }
  .label-icon { vertical-align: middle; }

  /* Detail view */
  .cust-detail { display: flex; flex-direction: column; gap: 20px; }
  .cust-detail-header { display: flex; }
  .back-btn { display: flex; align-items: center; gap: 6px; background: none; border: 1px solid #2a2a30; border-radius: 8px; color: #9997a0; font-size: 13px; padding: 7px 12px; cursor: pointer; transition: all .1s; }
  .back-btn:hover { border-color: #3a3a45; color: #e8e6e1; }
  .cust-detail-hero { display: flex; align-items: center; gap: 16px; background: #131318; border: 1px solid #1e1e25; border-radius: 14px; padding: 20px; }
  .cust-avatar-lg { width: 56px; height: 56px; border-radius: 14px; background: #5c6df022; color: #a5b4fc; display: flex; align-items: center; justify-content: center; font-size: 18px; font-weight: 700; border: 1px solid #5c6df033; flex-shrink: 0; }
  .cust-detail-name { font-size: 20px; font-weight: 600; }
  .cust-detail-meta { display: flex; gap: 14px; flex-wrap: wrap; margin-top: 5px; }
  .cust-detail-meta span { display: flex; align-items: center; gap: 5px; font-size: 12px; color: #6b6a65; }
  .cust-points-badge { margin-left: auto; display: flex; align-items: center; gap: 6px; background: #1a1a03; color: #d97706; border-radius: 10px; padding: 8px 14px; font-weight: 700; font-size: 15px; }

  .cust-detail-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
  .detail-stat { background: #131318; border: 1px solid #1e1e25; border-radius: 10px; padding: 14px 16px; display: flex; flex-direction: column; gap: 4px; }
  .detail-stat-label { font-size: 11px; color: #4a4a55; text-transform: uppercase; letter-spacing: .04em; }
  .detail-stat-value { font-size: 20px; font-weight: 700; color: #e8e6e1; }

  .section-title { font-size: 14px; font-weight: 500; color: #6b6a65; }
  .purchase-list { display: flex; flex-direction: column; gap: 6px; }
  .purchase-row { display: flex; align-items: center; justify-content: space-between; background: #131318; border: 1px solid #1e1e25; border-radius: 10px; padding: 12px 16px; gap: 12px; }
  .purchase-info { display: flex; flex-direction: column; gap: 3px; }
  .purchase-ticket { font-family: monospace; font-size: 12px; color: #9997a0; }
  .purchase-date { font-size: 12px; color: #4a4a55; }
  .purchase-items { font-size: 11px; color: #3a3a42; }
  .purchase-right { display: flex; align-items: center; gap: 12px; }
  .purchase-method { font-size: 11px; padding: 2px 8px; border-radius: 20px; }
  .purchase-method.cash { background: #0f2d1a; color: #22c55e; }
  .purchase-method.card { background: #1a1a2e; color: #a5b4fc; }
  .purchase-method.qr { background: #1a1a03; color: #d97706; }
  .purchase-total { font-size: 15px; font-weight: 700; color: #e8e6e1; }

  .spin { animation: spin 1s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
`;
