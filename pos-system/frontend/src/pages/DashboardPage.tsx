import React from 'react';
import {
  TrendingUp, TrendingDown, DollarSign, ShoppingCart,
  Users, Package, AlertTriangle, ArrowRight, Clock,
  BarChart2, Activity
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer
} from 'recharts';
import { useQuery } from '@tanstack/react-query';
import { useAppStore } from '../../store';
import { reportsApi, salesApi } from '../../lib/supabase';
import { supabase } from '../../lib/supabase';
import { format, subDays, startOfDay, endOfDay, startOfMonth } from 'date-fns';
import { es } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';

const fmt = (n: number) => `Bs ${n.toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtShort = (n: number) => n >= 1000 ? `Bs ${(n / 1000).toFixed(1)}k` : `Bs ${n.toFixed(0)}`;

function StatCard({
  label, value, sub, icon: Icon, color, trend, trendVal, onClick
}: {
  label: string; value: string; sub?: string; icon: React.ElementType;
  color: string; trend?: 'up' | 'down' | 'neutral'; trendVal?: string; onClick?: () => void;
}) {
  return (
    <div className={`dash-stat-card ${onClick ? 'clickable' : ''}`} onClick={onClick}>
      <div className="dash-stat-top">
        <div className="dash-stat-icon" style={{ background: color + '20', color }}>
          <Icon size={18} />
        </div>
        {trend && trendVal && (
          <span className={`dash-trend ${trend}`}>
            {trend === 'up' ? <TrendingUp size={12} /> : trend === 'down' ? <TrendingDown size={12} /> : <Activity size={12} />}
            {trendVal}
          </span>
        )}
      </div>
      <div className="dash-stat-value">{value}</div>
      <div className="dash-stat-label">{label}</div>
      {sub && <div className="dash-stat-sub">{sub}</div>}
    </div>
  );
}

function RecentSaleRow({ sale }: { sale: any }) {
  const hour = format(new Date(sale.created_at), 'HH:mm');
  const methods: Record<string, string> = { cash: 'Efectivo', card: 'Tarjeta', qr: 'QR', transfer: 'Transf.' };
  return (
    <div className="recent-sale-row">
      <div className="recent-sale-ticket">
        <span className="ticket-num">{sale.ticket_number}</span>
        <span className="ticket-time"><Clock size={10} />{hour}</span>
      </div>
      <span className="recent-sale-method">{methods[sale.payment_method] ?? sale.payment_method}</span>
      <span className="recent-sale-total">{fmt(sale.total)}</span>
    </div>
  );
}

export default function DashboardPage() {
  const { company, branch, user } = useAppStore();
  const navigate = useNavigate();

  const now = new Date();
  const todayFrom = startOfDay(now).toISOString();
  const todayTo = endOfDay(now).toISOString();
  const weekFrom = startOfDay(subDays(now, 6)).toISOString();
  const monthFrom = startOfMonth(now).toISOString();
  const prevWeekFrom = startOfDay(subDays(now, 13)).toISOString();
  const prevWeekTo = startOfDay(subDays(now, 7)).toISOString();

  // Today's sales
  const { data: todaySales = [] } = useQuery({
    queryKey: ['dashboard-today', company?.id],
    queryFn: () => salesApi.list(company!.id, { date_from: todayFrom, date_to: todayTo, limit: 50 }),
    enabled: !!company?.id,
    refetchInterval: 60_000,
    select: (d: any[]) => d.filter(s => s.status === 'completed'),
  });

  // Week summary for chart
  const { data: weekSales = [] } = useQuery({
    queryKey: ['dashboard-week', company?.id],
    queryFn: () => reportsApi.dailySummary(company!.id, weekFrom, todayTo),
    enabled: !!company?.id,
  });

  // Previous week for trend
  const { data: prevWeekSales = [] } = useQuery({
    queryKey: ['dashboard-prevweek', company?.id],
    queryFn: () => reportsApi.dailySummary(company!.id, prevWeekFrom, prevWeekTo),
    enabled: !!company?.id,
  });

  // Low stock count
  const { data: lowStock = [] } = useQuery({
    queryKey: ['low-stock', company?.id, branch?.id],
    queryFn: () => reportsApi.lowStock(company!.id, branch!.id),
    enabled: !!company?.id && !!branch?.id,
  });

  // Customer count
  const { data: customerCount = 0 } = useQuery({
    queryKey: ['customer-count', company?.id],
    queryFn: async () => {
      const { count } = await supabase
        .from('customers')
        .select('*', { count: 'exact', head: true })
        .eq('company_id', company!.id);
      return count ?? 0;
    },
    enabled: !!company?.id,
  });

  // Month revenue
  const { data: monthSales = [] } = useQuery({
    queryKey: ['dashboard-month', company?.id],
    queryFn: () => reportsApi.dailySummary(company!.id, monthFrom, todayTo),
    enabled: !!company?.id,
    select: (d: any[]) => d.filter(s => s.status !== 'voided'),
  });

  // Compute KPIs
  const todayRevenue = todaySales.reduce((a, s) => a + s.total, 0);
  const todayCount = todaySales.length;
  const todayAvg = todayCount > 0 ? todayRevenue / todayCount : 0;

  const weekCompleted = weekSales.filter((s: any) => s.status !== 'voided');
  const weekRevenue = weekCompleted.reduce((a: number, s: any) => a + s.total, 0);
  const prevRevenue = prevWeekSales.filter((s: any) => s.status !== 'voided').reduce((a: number, s: any) => a + s.total, 0);
  const weekTrend = prevRevenue > 0 ? ((weekRevenue - prevRevenue) / prevRevenue * 100) : 0;

  const monthRevenue = monthSales.reduce((a: number, s: any) => a + s.total, 0);

  // Chart data: last 7 days grouped by day
  const chartData = Array.from({ length: 7 }, (_, i) => {
    const day = subDays(now, 6 - i);
    const dayStr = format(day, 'yyyy-MM-dd');
    const daySales = weekSales.filter((s: any) => s.created_at?.startsWith(dayStr) && s.status !== 'voided');
    return {
      day: format(day, 'EEE', { locale: es }),
      revenue: daySales.reduce((a: number, s: any) => a + s.total, 0),
      count: daySales.length,
    };
  });

  const recentSales = [...todaySales].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  ).slice(0, 8);

  const greeting = (() => {
    const h = now.getHours();
    if (h < 12) return 'Buenos días';
    if (h < 18) return 'Buenas tardes';
    return 'Buenas noches';
  })();

  return (
    <div className="dash-layout">
      <style>{dashStyles}</style>

      {/* Header */}
      <div className="dash-header">
        <div>
          <h1 className="dash-greeting">{greeting}, {user?.name?.split(' ')[0]} 👋</h1>
          <p className="dash-date">{format(now, "EEEE d 'de' MMMM yyyy", { locale: es })}</p>
        </div>
        <button onClick={() => navigate('/pos')} className="dash-cta">
          <ShoppingCart size={16} /> Ir a Caja <ArrowRight size={14} />
        </button>
      </div>

      {/* KPI Cards */}
      <div className="dash-kpis">
        <StatCard
          icon={DollarSign} label="Ingresos hoy" value={fmt(todayRevenue)}
          sub={`${todayCount} ventas`} color="var(--c-primary)"
          trend={todayRevenue > 0 ? 'up' : 'neutral'} trendVal="hoy"
        />
        <StatCard
          icon={TrendingUp} label="Esta semana" value={fmt(weekRevenue)}
          sub="últimos 7 días" color="#34d399"
          trend={weekTrend >= 0 ? 'up' : 'down'}
          trendVal={`${weekTrend >= 0 ? '+' : ''}${weekTrend.toFixed(0)}% vs sem. ant.`}
        />
        <StatCard
          icon={BarChart2} label="Este mes" value={fmt(monthRevenue)}
          sub={format(now, 'MMMM yyyy', { locale: es })} color="#f59e0b"
        />
        <StatCard
          icon={ShoppingCart} label="Ticket promedio hoy" value={fmt(todayAvg)}
          color="#a78bfa"
        />
        <StatCard
          icon={Users} label="Clientes registrados" value={customerCount.toString()}
          color="#38bdf8" onClick={() => navigate('/customers')}
        />
        <StatCard
          icon={Package} label="Alertas de stock" value={lowStock.length.toString()}
          sub={lowStock.length > 0 ? 'productos bajo mínimo' : 'todo en orden'}
          color={lowStock.length > 0 ? '#f87171' : '#34d399'}
          trend={lowStock.length > 0 ? 'down' : 'neutral'}
          onClick={() => navigate('/inventory')}
        />
      </div>

      <div className="dash-main">
        {/* Area chart */}
        <div className="dash-chart-card">
          <div className="dash-card-header">
            <h3>Ingresos — últimos 7 días</h3>
            <span className="dash-card-total">{fmt(weekRevenue)}</span>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--c-primary)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="var(--c-primary)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e1e25" vertical={false} />
              <XAxis dataKey="day" tick={{ fill: '#6b6a65', fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={fmtShort} tick={{ fill: '#6b6a65', fontSize: 11 }} axisLine={false} tickLine={false} width={58} />
              <Tooltip
                contentStyle={{ background: '#1a1a1f', border: '1px solid #2a2a30', borderRadius: 8, color: '#e8e6e1', fontSize: 12 }}
                formatter={(v: number) => [fmt(v), 'Ingresos']}
              />
              <Area type="monotone" dataKey="revenue" stroke="var(--c-primary)" strokeWidth={2.5} fill="url(#revGrad)" dot={{ fill: 'var(--c-primary)', r: 3 }} activeDot={{ r: 5 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Recent sales */}
        <div className="dash-recent-card">
          <div className="dash-card-header">
            <h3>Ventas de hoy</h3>
            <button onClick={() => navigate('/reports')} className="dash-link">Ver reportes <ArrowRight size={12} /></button>
          </div>
          {recentSales.length === 0 ? (
            <div className="dash-empty">
              <ShoppingCart size={32} strokeWidth={1} color="#2a2a38" />
              <p>Sin ventas hoy</p>
              <button onClick={() => navigate('/pos')} className="dash-cta small">Ir a caja</button>
            </div>
          ) : (
            <div className="recent-sales-list">
              {recentSales.map(s => <RecentSaleRow key={s.id} sale={s} />)}
            </div>
          )}
        </div>
      </div>

      {/* Low stock alert */}
      {lowStock.length > 0 && (
        <div className="dash-alert-card">
          <div className="dash-alert-header">
            <AlertTriangle size={16} color="#d97706" />
            <span>{lowStock.length} producto{lowStock.length > 1 ? 's' : ''} con stock bajo</span>
            <button onClick={() => navigate('/inventory')} className="dash-link">Gestionar <ArrowRight size={12} /></button>
          </div>
          <div className="dash-alert-items">
            {(lowStock as any[]).slice(0, 5).map((s: any) => (
              <div key={s.product?.id} className="dash-alert-item">
                <span>{s.product?.name}</span>
                <span className="alert-qty">{s.quantity} / mín {s.min_quantity}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const dashStyles = `
  .dash-layout {
    padding: 28px 28px 40px;
    background: #0f0f11; min-height: 100%;
    color: #e8e6e1; font-family: 'DM Sans','Inter',sans-serif;
    display: flex; flex-direction: column; gap: 22px;
  }
  .dash-header { display: flex; align-items: flex-start; justify-content: space-between; flex-wrap: wrap; gap: 12px; }
  .dash-greeting { font-size: 22px; font-weight: 700; color: #e8e6e1; }
  .dash-date { font-size: 13px; color: #4a4a55; margin-top: 2px; text-transform: capitalize; }
  .dash-cta {
    display: flex; align-items: center; gap: 7px;
    background: var(--c-primary); border: none; border-radius: 10px;
    color: #fff; font-size: 14px; font-weight: 600; padding: 10px 18px; cursor: pointer;
    transition: all .15s; white-space: nowrap;
  }
  .dash-cta:hover { background: var(--c-primary-hover); transform: translateY(-1px); }
  .dash-cta.small { font-size: 13px; padding: 8px 14px; margin-top: 12px; }

  /* KPIs */
  .dash-kpis { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 12px; }
  .dash-stat-card {
    background: #131318; border: 1px solid #1e1e25; border-radius: 14px;
    padding: 18px; display: flex; flex-direction: column; gap: 6px;
    transition: border-color .15s, transform .15s;
  }
  .dash-stat-card.clickable { cursor: pointer; }
  .dash-stat-card.clickable:hover { border-color: #2a2a35; transform: translateY(-2px); }
  .dash-stat-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px; }
  .dash-stat-icon { width: 38px; height: 38px; border-radius: 10px; display: flex; align-items: center; justify-content: center; }
  .dash-trend { display: flex; align-items: center; gap: 4px; font-size: 11px; padding: 3px 8px; border-radius: 20px; font-weight: 600; }
  .dash-trend.up   { background: #0f2d1a; color: #22c55e; }
  .dash-trend.down { background: #1a0505; color: #f87171; }
  .dash-trend.neutral { background: #1a1a1f; color: #6b6a65; }
  .dash-stat-value { font-size: 22px; font-weight: 700; color: #e8e6e1; line-height: 1.1; }
  .dash-stat-label { font-size: 12px; color: #6b6a65; }
  .dash-stat-sub   { font-size: 11px; color: #3a3a42; }

  /* Main 2-col */
  .dash-main { display: grid; grid-template-columns: 1fr 340px; gap: 16px; }
  @media (max-width: 900px) { .dash-main { grid-template-columns: 1fr; } }

  .dash-chart-card, .dash-recent-card {
    background: #131318; border: 1px solid #1e1e25; border-radius: 14px; padding: 20px;
  }
  .dash-card-header {
    display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px;
  }
  .dash-card-header h3 { font-size: 14px; font-weight: 500; color: #9997a0; }
  .dash-card-total { font-size: 18px; font-weight: 700; color: #e8e6e1; }
  .dash-link {
    display: flex; align-items: center; gap: 4px;
    background: none; border: none; color: var(--c-primary); font-size: 12px; cursor: pointer; padding: 0;
    transition: color .1s;
  }
  .dash-link:hover { color: var(--c-primary-text); }

  /* Recent sales */
  .recent-sales-list { display: flex; flex-direction: column; gap: 2px; }
  .recent-sale-row {
    display: flex; align-items: center; gap: 10px;
    padding: 9px 8px; border-radius: 8px; transition: background .1s;
  }
  .recent-sale-row:hover { background: #1a1a1f; }
  .recent-sale-ticket { display: flex; flex-direction: column; gap: 2px; flex: 1; }
  .ticket-num { font-size: 12px; font-family: monospace; color: #9997a0; }
  .ticket-time { display: flex; align-items: center; gap: 3px; font-size: 10px; color: #3a3a42; }
  .recent-sale-method { font-size: 11px; color: #6b6a65; min-width: 56px; }
  .recent-sale-total { font-size: 14px; font-weight: 600; color: var(--c-primary-text); text-align: right; min-width: 70px; }

  .dash-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 32px 0; color: #2a2a38; gap: 8px; font-size: 13px; }

  /* Alert */
  .dash-alert-card {
    background: #1a1000; border: 1px solid #451a03; border-radius: 12px; padding: 16px 18px;
    display: flex; flex-direction: column; gap: 10px;
  }
  .dash-alert-header { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 500; color: #d97706; }
  .dash-alert-header .dash-link { margin-left: auto; color: #d97706; }
  .dash-alert-header .dash-link:hover { color: #fbbf24; }
  .dash-alert-items { display: flex; flex-direction: column; gap: 5px; }
  .dash-alert-item {
    display: flex; justify-content: space-between; align-items: center;
    font-size: 13px; color: #9997a0; padding: 5px 0;
    border-bottom: 1px solid #2a1500;
  }
  .dash-alert-item:last-child { border: none; }
  .alert-qty { font-size: 11px; color: #d97706; font-weight: 600; }
`;
