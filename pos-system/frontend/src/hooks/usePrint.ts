import { useAppStore } from '../store';
import type { Sale } from '../../shared/types';

// ── Ticket HTML para impresión en browser ────────────────────
function buildTicketHTML(sale: Sale, companyName: string, branchName: string): string {
  const fmt = (n: number) => `Bs ${n.toFixed(2)}`;
  const date = new Date(sale.created_at).toLocaleString('es-BO', {
    dateStyle: 'short', timeStyle: 'short',
  });

  const itemsHTML = (sale.items ?? []).map(item => `
    <tr>
      <td style="padding:2px 0;font-size:12px;">${item.name}</td>
      <td style="text-align:center;padding:2px 4px;font-size:12px;">${item.quantity}</td>
      <td style="text-align:right;padding:2px 0;font-size:12px;">${fmt(item.price)}</td>
      <td style="text-align:right;padding:2px 0;font-size:12px;">${fmt(item.subtotal)}</td>
    </tr>
  `).join('');

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        * { margin:0; padding:0; box-sizing:border-box; }
        body {
          font-family: 'Courier New', monospace;
          font-size: 13px;
          width: 80mm;
          margin: 0 auto;
          padding: 8px;
          color: #000;
        }
        .center { text-align: center; }
        .bold { font-weight: bold; }
        .divider { border-top: 1px dashed #000; margin: 6px 0; }
        table { width: 100%; border-collapse: collapse; }
        th { font-size: 11px; border-bottom: 1px solid #000; padding: 2px 0; text-align:left; }
        th.right, td.right { text-align: right; }
        .total-row td { font-weight: bold; font-size: 14px; border-top: 1px solid #000; padding-top: 4px; }
        .footer { font-size: 11px; text-align: center; margin-top: 8px; color: #555; }
        @media print {
          body { width: 80mm; }
          @page { margin: 0; size: 80mm auto; }
        }
      </style>
    </head>
    <body>
      <div class="center bold" style="font-size:15px;">${companyName}</div>
      <div class="center" style="font-size:11px;">${branchName}</div>
      <div class="divider"></div>

      <div style="font-size:11px;">
        <div>Ticket: <strong>${sale.ticket_number}</strong></div>
        <div>Fecha: ${date}</div>
        ${sale.customer ? `<div>Cliente: ${sale.customer.name}</div>` : ''}
      </div>

      <div class="divider"></div>

      <table>
        <thead>
          <tr>
            <th>Producto</th>
            <th style="text-align:center;">Cant.</th>
            <th class="right">P.U.</th>
            <th class="right">Total</th>
          </tr>
        </thead>
        <tbody>${itemsHTML}</tbody>
      </table>

      <div class="divider"></div>

      <table>
        <tbody>
          ${sale.discount > 0 ? `
            <tr>
              <td>Subtotal</td>
              <td class="right">${fmt(sale.subtotal)}</td>
            </tr>
            <tr>
              <td>Descuento</td>
              <td class="right">-${fmt(sale.discount)}</td>
            </tr>
          ` : ''}
          <tr class="total-row">
            <td>TOTAL</td>
            <td class="right">${fmt(sale.total)}</td>
          </tr>
          <tr>
            <td style="font-size:11px;">Pagó (${sale.payment_method})</td>
            <td class="right" style="font-size:11px;">${fmt(sale.paid_amount)}</td>
          </tr>
          ${sale.change_amount > 0 ? `
            <tr>
              <td style="font-size:11px;">Cambio</td>
              <td class="right" style="font-size:11px;">${fmt(sale.change_amount)}</td>
            </tr>
          ` : ''}
        </tbody>
      </table>

      <div class="divider"></div>
      <div class="footer">
        <p>¡Gracias por su compra!</p>
        <p style="margin-top:4px;">Conserve su ticket</p>
      </div>

      <div style="height:20px;"></div>
    </body>
    </html>
  `;
}

// ── ESC/POS text builder (para impresoras térmicas) ───────────
function buildESCPOS(sale: Sale, companyName: string): Uint8Array {
  const ESC = 0x1B, GS = 0x1D;

  const encoder = new TextEncoder();
  const lines: number[] = [];

  const push = (str: string) => {
    const bytes = encoder.encode(str + '\n');
    lines.push(...bytes);
  };

  const cmd = (...bytes: number[]) => lines.push(...bytes);

  // Initialize
  cmd(ESC, 0x40); // ESC @ - Init printer
  // Center align
  cmd(ESC, 0x61, 0x01);
  // Double width+height for title
  cmd(GS, 0x21, 0x11);
  push(companyName);
  // Normal size
  cmd(GS, 0x21, 0x00);
  push(sale.ticket_number);
  push(new Date(sale.created_at).toLocaleString('es-BO'));
  // Left align
  cmd(ESC, 0x61, 0x00);
  push('--------------------------------');
  push('Producto          Cant  Total');
  push('--------------------------------');

  for (const item of sale.items ?? []) {
    const name = item.name.substring(0, 18).padEnd(18);
    const qty  = item.quantity.toString().padStart(4);
    const sub  = `Bs${item.subtotal.toFixed(2)}`.padStart(8);
    push(`${name}${qty}${sub}`);
  }

  push('--------------------------------');
  cmd(GS, 0x21, 0x10); // Bold total
  push(`TOTAL:         Bs ${sale.total.toFixed(2)}`);
  cmd(GS, 0x21, 0x00);
  push(`Pago:          Bs ${sale.paid_amount.toFixed(2)}`);
  if (sale.change_amount > 0) push(`Cambio:        Bs ${sale.change_amount.toFixed(2)}`);

  push('--------------------------------');
  cmd(ESC, 0x61, 0x01);
  push('Gracias por su compra!');

  // Cut paper
  cmd(GS, 0x56, 0x41, 0x03);

  return new Uint8Array(lines);
}

// ── Hook ──────────────────────────────────────────────────────
export function usePrint() {
  const { company, branch } = useAppStore();

  /** Imprime en browser abriendo una ventana de impresión */
  const printTicketBrowser = (sale: Sale) => {
    const html = buildTicketHTML(
      sale,
      company?.name ?? 'Tienda',
      branch?.name ?? 'Sucursal',
    );
    const win = window.open('', '_blank', 'width=400,height=600');
    if (!win) { alert('Permite ventanas emergentes para imprimir'); return; }
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); win.close(); }, 500);
  };

  /** Imprime via Web Serial API a impresora térmica ESC/POS */
  const printTicketESCPOS = async (sale: Sale) => {
    if (!('serial' in navigator)) {
      console.warn('Web Serial API no disponible; usando impresión browser');
      printTicketBrowser(sale);
      return;
    }
    try {
      const port = await (navigator as any).serial.requestPort();
      await port.open({ baudRate: 9600 });
      const writer = port.writable.getWriter();
      const data = buildESCPOS(sale, company?.name ?? 'Tienda');
      await writer.write(data);
      writer.releaseLock();
      await port.close();
    } catch (err) {
      console.error('ESC/POS error:', err);
      // Fallback to browser print
      printTicketBrowser(sale);
    }
  };

  return { printTicketBrowser, printTicketESCPOS };
}
