const SAMPLE_SIZE = 100;

interface RGB { r: number; g: number; b: number }

function rgbToHsl({ r, g, b }: RGB): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h * 360, s, l];
}

function rgbToHex({ r, g, b }: RGB): string {
  return '#' + [r, g, b].map(c => c.toString(16).padStart(2, '0')).join('');
}

function adjustForDarkTheme(hex: string): { primary: string; primaryHover: string; primaryMuted: string; primaryText: string } {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const [h, s, l] = rgbToHsl({ r, g, b });

  const clamp = (v: number) => Math.min(1, Math.max(0, v));

  const primaryS = clamp(Math.max(s, 0.5));
  const primaryL = clamp(l < 0.3 ? 0.45 : l > 0.7 ? 0.55 : l);
  const primary = hslToHex(h, primaryS, primaryL);

  const hoverL = clamp(primaryL - 0.06);
  const primaryHover = hslToHex(h, primaryS, hoverL);

  const mutedL = clamp(primaryL + 0.25);
  const primaryText = hslToHex(h, clamp(primaryS * 0.7), mutedL);

  const primaryMuted = hslToHex(h, clamp(primaryS * 0.3), 0.12);

  return { primary, primaryHover, primaryMuted, primaryText };
}

function hslToHex(h: number, s: number, l: number): string {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * Math.max(0, Math.min(1, color)));
  };
  return rgbToHex({ r: f(0), g: f(8), b: f(4) });
}

export interface ThemeColors {
  primary: string;
  primaryHover: string;
  primaryMuted: string;
  primaryText: string;
}

export function extractColorsFromImage(imageUrl: string): Promise<ThemeColors> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const size = 64;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0, size, size);
        const data = ctx.getImageData(0, 0, size, size).data;

        const pixels: RGB[] = [];
        const step = Math.max(1, Math.floor((size * size) / SAMPLE_SIZE));
        for (let i = 0; i < size * size; i += step) {
          const idx = i * 4;
          const r = data[idx], g = data[idx + 1], b = data[idx + 2], a = data[idx + 3];
          if (a < 128) continue;
          const [, s, l] = rgbToHsl({ r, g, b });
          if (s < 0.15 || l < 0.08 || l > 0.92) continue;
          pixels.push({ r, g, b });
        }

        if (pixels.length === 0) {
          resolve(adjustForDarkTheme('#5c6df0'));
          return;
        }

        const avg: RGB = {
          r: Math.round(pixels.reduce((a, p) => a + p.r, 0) / pixels.length),
          g: Math.round(pixels.reduce((a, p) => a + p.g, 0) / pixels.length),
          b: Math.round(pixels.reduce((a, p) => a + p.b, 0) / pixels.length),
        };

        resolve(adjustForDarkTheme(rgbToHex(avg)));
      } catch {
        resolve(adjustForDarkTheme('#5c6df0'));
      }
    };
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = imageUrl;
  });
}

export const DEFAULT_THEME: ThemeColors = {
  primary: '#5c6df0',
  primaryHover: '#4f60e6',
  primaryMuted: '#5c6df022',
  primaryText: '#a5b4fc',
};

export function applyTheme(colors: ThemeColors) {
  const root = document.documentElement;
  root.style.setProperty('--c-primary', colors.primary);
  root.style.setProperty('--c-primary-hover', colors.primaryHover);
  root.style.setProperty('--c-primary-muted', colors.primaryMuted);
  root.style.setProperty('--c-primary-text', colors.primaryText);
}

export function saveTheme(colors: ThemeColors) {
  localStorage.setItem('pos_theme', JSON.stringify(colors));
}

export function loadSavedTheme(): ThemeColors | null {
  const stored = localStorage.getItem('pos_theme');
  if (!stored) return null;
  try { return JSON.parse(stored); } catch { return null; }
}
