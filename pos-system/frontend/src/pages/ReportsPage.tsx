import React, { useState, useMemo } from 'react';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell
} from 'recharts';
import {
  TrendingUp, ShoppingBag, DollarSign, Receipt,
  Calendar, Loader2, AlertTriangle, Download, FileSpreadsheet, FileText
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useAppStore } from '../../store';
import { reportsApi, salesApi } from '../../lib/supabase';
import { exportSalesToCSV, exportTopProductsToCSV, exportReportToPDF } from '../../hooks/useExport';
import { format, subDays, startOfDay, endOfDay, eachDayOfInterval, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import toast from 'react-hot-toast';

type Range = '7d' | '30d';

const fmt      = (n: number) => `Bs ${n.toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtShort = (n: number) => n >= 1000 ? `Bs ${(n / 1000).toFixed(1)}k` : `Bs ${n.toFixed(0)}`;

function KPICard({ icon: Icon, label, value, sub, color }: {
  icon: React.ElementType; label: string; value: string; sub?: string; color: string;
}) {
  return (
    <div className="kpi-card">
      <div className="kpi-icon" style={{ background: color + '22', color }}><Icon size={20} /></div>
      <div className="kpi-body">
        <span className="kpi-label">{label}</span>
        <span className="kpi-value">{value}</span>
        {sub && <span className="kpi-sub">{sub}</span>}
      </div>
    </div>
  );
}

// ── Export dropdown ───────────────────────────────────────────
function ExportMenu({ onExportCSV, onExportTopCSV, onExportPDF, loading }: {
  onExportCSV: () => void;
  onExportTopCSV: () => void;
  onExportPDF: () => void;
  loading: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="export-wrap" onBlur={() => setTimeout(() => setOpen(false), 150)}>
      <button
        onClick={() => setOpen(o => !o)}
        className={`export-btn ${open ? 'active' : ''}`}
        disabled={loading}
      >
        {loading ? <Loader2 size={14} className="spin" /> : <Download size={14} />}
        Exportar
      </button>
      {open && (
        <div className="export-dropdown">
          <button onClick={() => { onExportCSV(); setOpen(false); }} className="export-option">
            <FileSpreadsheet size={14} color="#22c55e" />
            <div>
              <div className="export-opt-title">Ventas en Excel (.csv)</div>
              <div className="export-opt-desc">Listado completo del período</div>
            </div>
          </button>
          <button onClick={() => { onExportTopCSV(); setOpen(false); }} className="export-option">
            <FileSpreadsheet size={14} color="#a5b4fc" />
            <div>
              <div className="export-opt-title">Top productos en Excel</div>
              <div className="export-opt-desc">Ranking por ingresos</div>
            </div>
          </button>
          <div className="export-divider" />
          <button onClick={() => { onExportPDF(); setOpen(false); }} className="export-option">
            <FileText size={14} color="#f87171" />
            <div>
              <div className="export-opt-title">Reporte completo en PDF</div>
              <div className="export-opt-desc">Listo para imprimir o compartir</div>
            </div>
          </button>
        </div>
      )}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────
export default function ReportsPage() {
  const { company, branch } = useAppStore();
  const [range, setRange] = useState<Range>('7d');

  const { dateFrom, dateTo } = useMemo(() => {
    const now  = new Date();
    const days = range === '7d' ? 7 : 30;
    return {
      dateFrom: startOfDay(subDays(now, days - 1)).toISOString(),
      dateTo:   endOfDay(now).toISOString(),
    };
  }, [range]);

  // Queries
  const { data: salesRaw = [], isLoading: loadingSales } = useQuery({
    queryKey: ['reports-daily', company?.id, dateFrom, dateTo],
    queryFn: () => reportsApi.dailySummary(company!.id, dateFrom, dateTo),
    enabled: !!company?.id,
  });

  const { data: topProducts = [], isLoading: loadingTop } = useQuery({
    queryKey: ['reports-top', company?.id, dateFrom, dateTo],
    queryFn: () => reportsApi.topProducts(company!.id, dateFrom, dateTo, 8),
    enabled: !!company?.id,
  });

  const { data: lowStock = [] } = useQuery({
    queryKey: ['low-stock', company?.id, branch?.id],
    queryFn: () => reportsApi.lowStock(company!.id, branch!.id),
    enabled: !!company?.id && !!branch?.id,
  });

  // Full sales for export (with user/customer)
  const { data: fullSales = [], isLoading: loadingFull } = useQuery({
    queryKey: ['reports-full-sales', company?.id, dateFrom, dateTo],
    queryFn: () => salesApi.list(company!.id, { date_from: dateFrom, date_to: dateTo, limit: 2000 }),
    enabled: !!company?.id,
  });

  // Build chart data
  const days = eachDayOfInterval({ start: parseISO(dateFrom), end: parseISO(dateTo) });
  const dailyData = days.map(day => {
    const dayStr   = format(day, 'yyyy-MM-dd');
    const daySales = salesRaw.filter((s: any) => s.created_at.startsWith(dayStr) && s.status !== 'voided');
    return {
      day:     format(day, 'dd/MM', { locale: es }),
      revenue: daySales.reduce((a: number, s: any) => a + s.total, 0),
      count:   daySales.length,
    };
  });

  // KPIs
  const completed     = salesRaw.filter((s: any) => s.status !== 'voided');
  const totalRevenue  = completed.reduce((a: number, s: any) => a + s.total, 0);
  const totalSales    = completed.length;
  const avgTicket     = totalSales > 0 ? totalRevenue / totalSales : 0;
  const totalItems    = completed.reduce((a: number, s: any) =>
    a + (s.items?.reduce((b: number, i: any) => b + i.quantity, 0) ?? 0), 0);

  const PIE_COLORS = ['#5c6df0','#34d399','#f59e0b','#f87171','#a78bfa','#38bdf8','#fb923c','#4ade80'];

  const isLoading = loadingSales || loadingTop;

  // Export handlers
  const handleExportCSV = () => {
    if (!fullSales.length) { toast.error('Sin datos para exportar'); return; }
    exportSalesToCSV(fullSales, dateFrom, dateTo);
    toast.success('Descargando ventas en Excel…');
  };

  const handleExportTopCSV = () => {
    if (!topProducts.length) { toast.error('Sin datos para exportar'); return; }
    exportTopProductsToCSV(topProducts);
    toast.success('Descargando top productos…');
  };

  const handleExportPDF = () => {
    if (!company) return;
    exportReportToPDF({
      companyName:   company.name,
      branchName:    branch?.name ?? 'Sucursal',
      dateFrom,
      dateTo,
      totalRevenue,
      totalSales,
      avgTicket,
      totalItems,
      topProducts,
      dailyData,
      lowStock: lowStock as any[],
    });
    toast.success('Preparando PDF para imprimir…');
  };

  return (
    <div className="rep-layout">
      <style>{repStyles}</style>

      <div className="rep-header">
        <div className="rep-title">
          <TrendingUp size={20} />
          <h1>Reportes</h1>
        </div>
        <div className="rep-controls">
          <div className="range-selector">
            {([['7d','Últimos 7 días'],['30d','Últimos 30 días']] as const).map(([v, l]) => (
              <button key={v} onClick={() => setRange(v)} className={`range-btn ${range === v ? 'active' : ''}`}>
                <Calendar size={12} />{l}
              </button>
            ))}
          </div>
          <ExportMenu
            onExportCSV={handleExportCSV}
            onExportTopCSV={handleExportTopCSV}
            onExportPDF={handleExportPDF}
            loading={loadingFull}
          />
        </div>
      </div>

      {isLoading ? (
        <div className="rep-loading"><Loader2 size={28} className="spin" /> Cargando datos…</div>
      ) : (
        <>
          <div className="kpi-grid">
            <KPICard icon={DollarSign}  label="Ingresos totales"   value={fmt(totalRevenue)}      sub={`${range === '7d' ? '7' : '30'} días`}  color="#5c6df0" />
            <KPICard icon={Receipt} label="Ventas"             value={totalSales.toString()}   sub="tickets emitidos"                        color="#34d399" />
            <KPICard icon={ShoppingBag} label="Ticket promedio"    value={fmt(avgTicket)}          sub="por venta"                               color="#f59e0b" />
            <KPICard icon={TrendingUp}  label="Artículos vendidos" value={totalItems.toString()}   sub="unidades"                                color="#a78bfa" />
          </div>

          <div className="chart-card">
            <h3>Ingresos por día</h3>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={dailyData} margin={{ top: 5, right: 20, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e1e25" />
                <XAxis dataKey="day" tick={{ fill: '#6b6a65', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={fmtShort} tick={{ fill: '#6b6a65', fontSize: 11 }} axisLine={false} tickLine={false} width={60} />
                <Tooltip
                  contentStyle={{ background: '#1a1a1f', border: '1px solid #2a2a30', borderRadius: 8, color: '#e8e6e1', fontSize: 12 }}
                  formatter={(v: number) => [fmt(v), 'Ingresos']}
                />
                <Line type="monotone" dataKey="revenue" stroke="#5c6df0" strokeWidth={2.5} dot={{ fill: '#5c6df0', r: 3 }} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="chart-card">
            <h3>Número de ventas por día</h3>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={dailyData} margin={{ top: 5, right: 20, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e1e25" />
                <XAxis dataKey="day" tick={{ fill: '#6b6a65', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#6b6a65', fontSize: 11 }} axisLine={false} tickLine={false} width={30} />
                <Tooltip
                  contentStyle={{ background: '#1a1a1f', border: '1px solid #2a2a30', borderRadius: 8, color: '#e8e6e1', fontSize: 12 }}
                  formatter={(v: number) => [v, 'Ventas']}
                />
                <Bar dataKey="count" fill="#34d399" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="charts-row">
            <div className="chart-card flex-1">
              <h3>Productos más vendidos</h3>
              {topProducts.length === 0 ? (
                <div className="chart-empty">Sin datos en este período</div>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={topProducts} layout="vertical" margin={{ top: 0, right: 20, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e1e25" horizontal={false} />
                    <XAxis type="number" tickFormatter={fmtShort} tick={{ fill: '#6b6a65', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="name" tick={{ fill: '#9997a0', fontSize: 11 }} axisLine={false} tickLine={false} width={100} />
                    <Tooltip
                      contentStyle={{ background: '#1a1a1f', border: '1px solid #2a2a30', borderRadius: 8, color: '#e8e6e1', fontSize: 12 }}
                      formatter={(v: number) => [fmt(v), 'Ingresos']}
                    />
                    <Bar dataKey="revenue" fill="#a78bfa" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="chart-card pie-card">
              <h3>Distribución de ingresos</h3>
              {topProducts.length === 0 ? (
                <div className="chart-empty">Sin datos</div>
              ) : (
                <>
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie
                        data={topProducts.slice(0, 6)} dataKey="revenue" nameKey="name"
                        cx="50%" cy="50%" outerRadius={80} innerRadius={44} strokeWidth={0}
                      >
                        {topProducts.slice(0, 6).map((_: any, i: number) => (
                          <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{ background: '#1a1a1f', border: '1px solid #2a2a30', borderRadius: 8, color: '#e8e6e1', fontSize: 12 }}
                        formatter={(v: number) => [fmt(v)]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="pie-legend">
                    {topProducts.slice(0, 6).map((p: any, i: number) => (
                      <div key={p.product_id} className="pie-legend-item">
                        <span className="pie-dot" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                        <span className="pie-name">{p.name}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          {(lowStock as any[]).length > 0 && (
            <div className="alert-card">
              <div className="alert-header">
                <AlertTriangle size={16} color="#d97706" />
                <span>Productos con stock bajo ({(lowStock as any[]).length})</span>
              </div>
              <div className="low-stock-list">
                {(lowStock as any[]).map((s: any) => (
                  <div key={s.product?.id} className="low-stock-item">
                    <span>{s.product?.name}</span>
                    <span className="low-qty">{s.quantity} / mín {s.min_quantity}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

const repStyles = `
  .rep-layout { padding:24px; background:#0f0f11; min-height:100%; color:#e8e6e1; font-family:'DM Sans','Inter',sans-serif; display:flex; flex-direction:column; gap:20px; }
  .rep-header { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px; }
  .rep-title  { display:flex; align-items:center; gap:10px; }
  .rep-title h1 { font-size:20px; font-weight:600; margin:0; }
  .rep-controls { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
  .rep-loading { display:flex; align-items:center; justify-content:center; gap:10px; color:#4a4a55; padding:60px; }

  .range-selector { display:flex; gap:6px; }
  .range-btn { display:flex; align-items:center; gap:6px; padding:7px 12px; border:1px solid #2a2a30; border-radius:8px; background:transparent; color:#6b6a65; font-size:12px; cursor:pointer; transition:all .15s; }
  .range-btn.active { border-color:#5c6df0; background:#1a1a2e; color:#a5b4fc; }
  .range-btn:hover:not(.active) { border-color:#3a3a45; color:#e8e6e1; }

  /* Export */
  .export-wrap { position:relative; }
  .export-btn { display:flex; align-items:center; gap:6px; padding:7px 13px; background:#1a1a1f; border:1px solid #2a2a30; border-radius:8px; color:#9997a0; font-size:12px; cursor:pointer; transition:all .15s; }
  .export-btn:hover, .export-btn.active { border-color:#3a3a45; color:#e8e6e1; background:#1e1e24; }
  .export-btn:disabled { opacity:0.5; cursor:not-allowed; }
  .export-dropdown { position:absolute; right:0; top:calc(100% + 6px); background:#1a1a1f; border:1px solid #2a2a30; border-radius:12px; padding:6px; min-width:240px; z-index:50; box-shadow:0 12px 40px rgba(0,0,0,.5); animation:fadeDown .15s ease; }
  @keyframes fadeDown { from{opacity:0;transform:translateY(-6px)} to{opacity:1;transform:translateY(0)} }
  .export-option { width:100%; display:flex; align-items:center; gap:10px; padding:10px 12px; background:none; border:none; border-radius:8px; color:#e8e6e1; cursor:pointer; text-align:left; transition:background .1s; }
  .export-option:hover { background:#131318; }
  .export-opt-title { font-size:13px; font-weight:500; color:#e8e6e1; }
  .export-opt-desc  { font-size:11px; color:#4a4a55; margin-top:1px; }
  .export-divider { height:1px; background:#1e1e25; margin:4px 0; }

  .kpi-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:12px; }
  .kpi-card { background:#131318; border:1px solid #1e1e25; border-radius:12px; padding:16px; display:flex; align-items:center; gap:14px; }
  .kpi-icon { width:44px; height:44px; border-radius:10px; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
  .kpi-body { display:flex; flex-direction:column; gap:2px; }
  .kpi-label { font-size:11px; color:#6b6a65; text-transform:uppercase; letter-spacing:.05em; }
  .kpi-value { font-size:20px; font-weight:700; color:#e8e6e1; }
  .kpi-sub   { font-size:11px; color:#4a4a55; }

  .chart-card { background:#131318; border:1px solid #1e1e25; border-radius:12px; padding:20px; }
  .chart-card h3 { font-size:14px; font-weight:500; color:#9997a0; margin:0 0 16px; }
  .chart-empty { text-align:center; padding:40px; color:#3a3a42; font-size:13px; }

  .charts-row { display:flex; gap:16px; flex-wrap:wrap; }
  .charts-row .flex-1 { flex:1; min-width:300px; }
  .pie-card { width:280px; flex-shrink:0; }
  .pie-legend { display:flex; flex-direction:column; gap:6px; margin-top:8px; }
  .pie-legend-item { display:flex; align-items:center; gap:8px; font-size:12px; color:#9997a0; }
  .pie-dot { width:8px; height:8px; border-radius:50%; flex-shrink:0; }
  .pie-name { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }

  .alert-card { background:#1a1000; border:1px solid #451a03; border-radius:12px; padding:16px; }
  .alert-header { display:flex; align-items:center; gap:8px; font-size:13px; font-weight:500; color:#d97706; margin-bottom:12px; }
  .low-stock-list { display:flex; flex-direction:column; gap:6px; }
  .low-stock-item { display:flex; justify-content:space-between; font-size:13px; color:#9997a0; padding:4px 0; border-bottom:1px solid #2a1500; }
  .low-qty { color:#d97706; font-weight:600; font-size:12px; }

  .spin { animation:spin 1s linear infinite; }
  @keyframes spin { to { transform:rotate(360deg); } }
`;
