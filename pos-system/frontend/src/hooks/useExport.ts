import { format } from 'date-fns';
import { es } from 'date-fns/locale';

const fmt = (n: number) => `Bs ${n.toFixed(2)}`;

// ── CSV builder (abre como Excel) ─────────────────────────────
function buildCSV(headers: string[], rows: (string | number)[][]): string {
  const escape = (v: string | number) => {
    const s = String(v);
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };
  const lines = [headers, ...rows].map(row => row.map(escape).join(','));
  return '\uFEFF' + lines.join('\n'); // BOM for Excel UTF-8
}

function downloadFile(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Export sales to CSV/Excel ─────────────────────────────────
export function exportSalesToCSV(sales: any[], dateFrom: string, dateTo: string) {
  const headers = [
    'Ticket', 'Fecha', 'Hora', 'Cajero', 'Cliente',
    'Subtotal', 'Descuento', 'Total', 'Método de pago', 'Estado'
  ];

  const rows = sales.map(s => [
    s.ticket_number,
    format(new Date(s.created_at), 'dd/MM/yyyy', { locale: es }),
    format(new Date(s.created_at), 'HH:mm'),
    s.user?.name ?? '—',
    s.customer?.name ?? 'Consumidor final',
    s.subtotal,
    s.discount,
    s.total,
    s.payment_method === 'cash' ? 'Efectivo'
      : s.payment_method === 'card' ? 'Tarjeta'
      : s.payment_method === 'qr' ? 'QR' : s.payment_method,
    s.status === 'completed' ? 'Completada' : s.status === 'voided' ? 'Anulada' : s.status,
  ]);

  const dateTag = format(new Date(), 'yyyy-MM-dd');
  downloadFile(buildCSV(headers, rows), `ventas_${dateTag}.csv`, 'text/csv;charset=utf-8');
}

// ── Export inventory to CSV ───────────────────────────────────
export function exportInventoryToCSV(products: any[]) {
  const headers = [
    'Nombre', 'SKU', 'Código de barras', 'Categoría',
    'Precio', 'Costo', 'Margen %', 'Stock actual', 'Stock mínimo', 'Unidad', 'Estado'
  ];

  const rows = products.map(p => {
    const margin = p.price > 0 ? ((p.price - p.cost) / p.price * 100).toFixed(1) : '0';
    return [
      p.name,
      p.sku ?? '',
      p.barcode ?? '',
      p.category?.name ?? '',
      p.price,
      p.cost,
      margin,
      p.stock?.quantity ?? '',
      p.stock?.min_quantity ?? '',
      p.unit,
      p.is_active ? 'Activo' : 'Inactivo',
    ];
  });

  const dateTag = format(new Date(), 'yyyy-MM-dd');
  downloadFile(buildCSV(headers, rows), `inventario_${dateTag}.csv`, 'text/csv;charset=utf-8');
}

// ── Export top products ───────────────────────────────────────
export function exportTopProductsToCSV(products: any[]) {
  const headers = ['Producto', 'Unidades vendidas', 'Ingresos'];
  const rows = products.map(p => [p.name, p.qty, p.revenue]);
  const dateTag = format(new Date(), 'yyyy-MM-dd');
  downloadFile(buildCSV(headers, rows), `top_productos_${dateTag}.csv`, 'text/csv;charset=utf-8');
}

// ── Export report to HTML → printable PDF ────────────────────
export function exportReportToPDF(params: {
  companyName: string;
  branchName: string;
  dateFrom: string;
  dateTo: string;
  totalRevenue: number;
  totalSales: number;
  avgTicket: number;
  totalItems: number;
  topProducts: any[];
  dailyData: { day: string; revenue: number; count: number }[];
  lowStock: any[];
}) {
  const {
    companyName, branchName, dateFrom, dateTo,
    totalRevenue, totalSales, avgTicket, totalItems,
    topProducts, dailyData, lowStock
  } = params;

  const dateFromFmt = format(new Date(dateFrom), "d 'de' MMMM yyyy", { locale: es });
  const dateToFmt   = format(new Date(dateTo),   "d 'de' MMMM yyyy", { locale: es });
  const now          = format(new Date(), "dd/MM/yyyy HH:mm", { locale: es });

  const topProductsHTML = topProducts.map((p, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${p.name}</td>
      <td style="text-align:right">${p.qty?.toFixed(0) ?? '—'}</td>
      <td style="text-align:right">${fmt(p.revenue)}</td>
    </tr>
  `).join('');

  const dailyHTML = dailyData.map(d => `
    <tr>
      <td>${d.day}</td>
      <td style="text-align:right">${d.count}</td>
      <td style="text-align:right">${fmt(d.revenue)}</td>
    </tr>
  `).join('');

  const lowStockHTML = lowStock.length > 0 ? `
    <div class="section">
      <h2>⚠️ Productos con stock bajo</h2>
      <table>
        <thead><tr><th>Producto</th><th>Stock actual</th><th>Mínimo</th></tr></thead>
        <tbody>
          ${lowStock.map((s: any) => `
            <tr>
              <td>${s.product?.name ?? '—'}</td>
              <td style="text-align:right;color:#d97706">${s.quantity}</td>
              <td style="text-align:right">${s.min_quantity}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  ` : '';

  const html = `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <title>Reporte de ventas — ${companyName}</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #1a1a1a; background: white; padding: 0; }
        @page { margin: 20mm 15mm; size: A4; }

        .header { background: #1a1a2e; color: white; padding: 24px 30px; display: flex; justify-content: space-between; align-items: flex-start; }
        .header-left h1 { font-size: 22px; font-weight: 700; }
        .header-left p  { font-size: 12px; opacity: 0.7; margin-top: 4px; }
        .header-right   { text-align: right; font-size: 11px; opacity: 0.7; line-height: 1.6; }

        .period-bar { background: #f0f0f8; padding: 10px 30px; font-size: 12px; color: #555; border-bottom: 1px solid #ddd; }

        .content { padding: 24px 30px; display: flex; flex-direction: column; gap: 24px; }

        .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
        .kpi { background: white; border: 1px solid #e5e7eb; border-radius: 10px; padding: 14px; }
        .kpi-label { font-size: 10px; color: #6b7280; text-transform: uppercase; letter-spacing: .05em; margin-bottom: 6px; }
        .kpi-value { font-size: 20px; font-weight: 700; color: #111; }
        .kpi-sub   { font-size: 10px; color: #9ca3af; margin-top: 2px; }

        .section { }
        .section h2 { font-size: 14px; font-weight: 600; color: #374151; margin-bottom: 10px; padding-bottom: 6px; border-bottom: 1px solid #e5e7eb; }

        table { width: 100%; border-collapse: collapse; font-size: 12px; }
        thead { background: #f9fafb; }
        th { padding: 8px 10px; text-align: left; font-weight: 600; color: #6b7280; border-bottom: 1px solid #e5e7eb; }
        td { padding: 8px 10px; border-bottom: 1px solid #f3f4f6; color: #374151; }
        tr:last-child td { border: none; }
        tr:nth-child(even) { background: #fafafa; }

        .footer { margin-top: 16px; padding-top: 12px; border-top: 1px solid #e5e7eb; font-size: 10px; color: #9ca3af; text-align: center; }

        @media print { .no-print { display: none; } }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="header-left">
          <h1>${companyName}</h1>
          <p>${branchName} • Reporte de ventas</p>
        </div>
        <div class="header-right">
          Generado: ${now}<br>
          Sistema POS
        </div>
      </div>

      <div class="period-bar">
        📅 Período: ${dateFromFmt} — ${dateToFmt}
      </div>

      <div class="content">
        <!-- KPIs -->
        <div class="kpis">
          <div class="kpi">
            <div class="kpi-label">Ingresos totales</div>
            <div class="kpi-value">${fmt(totalRevenue)}</div>
          </div>
          <div class="kpi">
            <div class="kpi-label">Ventas</div>
            <div class="kpi-value">${totalSales}</div>
            <div class="kpi-sub">tickets emitidos</div>
          </div>
          <div class="kpi">
            <div class="kpi-label">Ticket promedio</div>
            <div class="kpi-value">${fmt(avgTicket)}</div>
          </div>
          <div class="kpi">
            <div class="kpi-label">Artículos vendidos</div>
            <div class="kpi-value">${totalItems}</div>
          </div>
        </div>

        <!-- Ventas por día -->
        <div class="section">
          <h2>Ventas por día</h2>
          <table>
            <thead><tr><th>Día</th><th style="text-align:right">Ventas</th><th style="text-align:right">Ingresos</th></tr></thead>
            <tbody>${dailyHTML}</tbody>
          </table>
        </div>

        <!-- Top productos -->
        ${topProducts.length > 0 ? `
        <div class="section">
          <h2>Productos más vendidos</h2>
          <table>
            <thead><tr><th>#</th><th>Producto</th><th style="text-align:right">Cantidad</th><th style="text-align:right">Ingresos</th></tr></thead>
            <tbody>${topProductsHTML}</tbody>
          </table>
        </div>
        ` : ''}

        ${lowStockHTML}

        <div class="footer">
          Reporte generado automáticamente por el sistema POS • ${companyName} • ${now}
        </div>
      </div>

      <script>
        window.onload = () => { window.print(); }
      </script>
    </body>
    </html>
  `;

  const win = window.open('', '_blank', 'width=900,height=700');
  if (!win) { alert('Permite ventanas emergentes para exportar PDF'); return; }
  win.document.write(html);
  win.document.close();
}
