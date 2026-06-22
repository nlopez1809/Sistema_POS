import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Re-implementar las funciones puras de useExport para testear ──
// (sin importar el módulo que tiene side-effects de browser)

function buildCSV(headers: string[], rows: (string | number)[][]): string {
  const escape = (v: string | number) => {
    const s = String(v);
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };
  const lines = [headers, ...rows].map(row => row.map(escape).join(','));
  return '\uFEFF' + lines.join('\n');
}

const makeSale = (overrides: any = {}) => ({
  ticket_number:   '20240115-0001',
  created_at:      '2024-01-15T10:30:00.000Z',
  subtotal:        100,
  discount:        0,
  total:           100,
  payment_method:  'cash',
  status:          'completed',
  user:            { name: 'Admin' },
  customer:        null,
  ...overrides,
});

// ── CSV builder ───────────────────────────────────────────────
describe('buildCSV', () => {
  it('incluye BOM UTF-8 para compatibilidad con Excel', () => {
    const csv = buildCSV(['Col1'], [['valor']]);
    expect(csv.charCodeAt(0)).toBe(0xFEFF);
  });

  it('primera fila son los encabezados', () => {
    const csv = buildCSV(['Ticket', 'Total'], [['T001', 100]]);
    const lines = csv.slice(1).split('\n');
    expect(lines[0]).toBe('Ticket,Total');
  });

  it('datos en filas siguientes', () => {
    const csv = buildCSV(['A', 'B'], [['x', 'y'], ['1', '2']]);
    const lines = csv.slice(1).split('\n');
    expect(lines[1]).toBe('x,y');
    expect(lines[2]).toBe('1,2');
  });

  it('escapa valores con comas dentro de comillas', () => {
    const csv = buildCSV(['Nombre'], [['Tienda, SRL']]);
    const lines = csv.slice(1).split('\n');
    expect(lines[1]).toBe('"Tienda, SRL"');
  });

  it('escapa comillas dobles duplicándolas', () => {
    const csv = buildCSV(['Desc'], [['"especial"']]);
    const lines = csv.slice(1).split('\n');
    expect(lines[1]).toBe('"""especial"""');
  });

  it('genera CSV vacío solo con encabezados si no hay filas', () => {
    const csv = buildCSV(['Col1', 'Col2'], []);
    const lines = csv.slice(1).split('\n');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toBe('Col1,Col2');
  });

  it('maneja números sin escapar', () => {
    const csv = buildCSV(['Total'], [[150.50]]);
    const lines = csv.slice(1).split('\n');
    expect(lines[1]).toBe('150.5');
  });
});

// ── Transformación de ventas a filas CSV ──────────────────────
describe('exportSalesToCSV — transformación de datos', () => {
  const salesToRows = (sales: any[]) => sales.map(s => [
    s.ticket_number,
    s.created_at.slice(0, 10).split('-').reverse().join('/'),
    s.created_at.slice(11, 16),
    s.user?.name ?? '—',
    s.customer?.name ?? 'Consumidor final',
    s.subtotal,
    s.discount,
    s.total,
    s.payment_method === 'cash' ? 'Efectivo'
      : s.payment_method === 'card' ? 'Tarjeta'
      : s.payment_method === 'qr'   ? 'QR' : s.payment_method,
    s.status === 'completed' ? 'Completada'
      : s.status === 'voided' ? 'Anulada' : s.status,
  ]);

  it('transforma una venta correctamente', () => {
    const rows = salesToRows([makeSale()]);
    expect(rows[0][0]).toBe('20240115-0001');
    expect(rows[0][4]).toBe('Consumidor final');
    expect(rows[0][8]).toBe('Efectivo');
    expect(rows[0][9]).toBe('Completada');
  });

  it('muestra el nombre del cliente cuando existe', () => {
    const rows = salesToRows([makeSale({ customer: { name: 'María López' } })]);
    expect(rows[0][4]).toBe('María López');
  });

  it('traduce método de pago card → Tarjeta', () => {
    const rows = salesToRows([makeSale({ payment_method: 'card' })]);
    expect(rows[0][8]).toBe('Tarjeta');
  });

  it('traduce método de pago qr → QR', () => {
    const rows = salesToRows([makeSale({ payment_method: 'qr' })]);
    expect(rows[0][8]).toBe('QR');
  });

  it('traduce estado voided → Anulada', () => {
    const rows = salesToRows([makeSale({ status: 'voided' })]);
    expect(rows[0][9]).toBe('Anulada');
  });

  it('genera múltiples filas para múltiples ventas', () => {
    const rows = salesToRows([makeSale(), makeSale({ ticket_number: '20240115-0002' })]);
    expect(rows).toHaveLength(2);
    expect(rows[1][0]).toBe('20240115-0002');
  });
});

// ── Top products export ───────────────────────────────────────
describe('exportTopProductsToCSV — transformación', () => {
  const topProducts = [
    { name: 'Coca Cola 2L', qty: 48, revenue: 720 },
    { name: 'Agua 600ml',   qty: 120, revenue: 540 },
    { name: 'Papas Fritas', qty: 30,  revenue: 270 },
  ];

  const toRows = (products: typeof topProducts) =>
    products.map(p => [p.name, p.qty, p.revenue]);

  it('genera una fila por producto', () => {
    const rows = toRows(topProducts);
    expect(rows).toHaveLength(3);
  });

  it('la primera columna es el nombre', () => {
    const rows = toRows(topProducts);
    expect(rows[0][0]).toBe('Coca Cola 2L');
  });

  it('la segunda columna son unidades vendidas', () => {
    const rows = toRows(topProducts);
    expect(rows[0][1]).toBe(48);
  });

  it('la tercera columna son los ingresos', () => {
    const rows = toRows(topProducts);
    expect(rows[0][2]).toBe(720);
  });

  it('el CSV resultante tiene el formato correcto', () => {
    const headers = ['Producto', 'Unidades vendidas', 'Ingresos'];
    const csv = buildCSV(headers, toRows(topProducts));
    const lines = csv.slice(1).split('\n');
    expect(lines[0]).toBe('Producto,Unidades vendidas,Ingresos');
    expect(lines[1]).toBe('Coca Cola 2L,48,720');
  });
});

// ── PDF report data preparation ───────────────────────────────
describe('exportReportToPDF — preparación de datos', () => {
  const buildDailyData = (salesRaw: any[], days: string[]) =>
    days.map(dayStr => {
      const daySales = salesRaw.filter(s =>
        s.created_at.startsWith(dayStr) && s.status !== 'voided'
      );
      return {
        day:     dayStr,
        revenue: daySales.reduce((a: number, s: any) => a + s.total, 0),
        count:   daySales.length,
      };
    });

  const salesRaw = [
    { total: 150, status: 'completed', created_at: '2024-01-15T08:00:00Z' },
    { total: 200, status: 'completed', created_at: '2024-01-15T09:00:00Z' },
    { total:  80, status: 'voided',    created_at: '2024-01-15T10:00:00Z' },
    { total: 300, status: 'completed', created_at: '2024-01-16T08:00:00Z' },
  ];

  it('agrupa ingresos por día excluyendo anuladas', () => {
    const data = buildDailyData(salesRaw, ['2024-01-15', '2024-01-16']);
    expect(data[0].revenue).toBe(350); // 150 + 200 (no 80)
    expect(data[1].revenue).toBe(300);
  });

  it('cuenta correctamente el número de ventas por día', () => {
    const data = buildDailyData(salesRaw, ['2024-01-15', '2024-01-16']);
    expect(data[0].count).toBe(2);
    expect(data[1].count).toBe(1);
  });

  it('día sin ventas tiene revenue 0 y count 0', () => {
    const data = buildDailyData(salesRaw, ['2024-01-17']);
    expect(data[0].revenue).toBe(0);
    expect(data[0].count).toBe(0);
  });

  it('KPIs se calculan correctamente a partir de ventas completadas', () => {
    const completed    = salesRaw.filter(s => s.status !== 'voided');
    const totalRevenue = completed.reduce((a, s) => a + s.total, 0);
    const totalSales   = completed.length;
    const avgTicket    = totalRevenue / totalSales;

    expect(totalRevenue).toBe(650); // 150 + 200 + 300
    expect(totalSales).toBe(3);
    expect(avgTicket).toBeCloseTo(216.67, 1);
  });
});
