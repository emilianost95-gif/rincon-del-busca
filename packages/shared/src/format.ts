import type { BusinessHours } from './schemas';

const LOCALES: Record<string, string> = {
  CLP: 'es-CL',
  ARS: 'es-AR',
  USD: 'en-US',
  PEN: 'es-PE',
  COP: 'es-CO',
  MXN: 'es-MX',
  UYU: 'es-UY',
};

export function formatMoney(value: number, currency = 'CLP'): string {
  return new Intl.NumberFormat(LOCALES[currency] ?? 'es-AR', {
    style: 'currency',
    currency,
    maximumFractionDigits: currency === 'CLP' || currency === 'COP' ? 0 : 2,
  }).format(value);
}

export function formatQty(value: number): string {
  return new Intl.NumberFormat('es-AR', { maximumFractionDigits: 3 }).format(value);
}

export function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export const DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

/** Arma el enlace de WhatsApp. Devuelve null si el número no está configurado. */
export function whatsappLink(number: string | null | undefined, message?: string): string | null {
  if (!number) return null;
  const clean = number.replace(/\D/g, '');
  if (clean.length < 8) return null;
  const text = message ? `?text=${encodeURIComponent(message)}` : '';
  return `https://wa.me/${clean}${text}`;
}

/** Calcula si el local está abierto ahora según los horarios cargados. */
export function openStatus(
  hours: BusinessHours,
  now: Date,
): { state: 'open' | 'closed' | 'unknown'; label: string } {
  if (!hours.length) return { state: 'unknown', label: 'Horario pendiente de confirmar' };
  const today = hours.find((h) => h.day === now.getDay());
  if (!today || today.closed || !today.ranges.length) return { state: 'closed', label: 'Hoy cerrado' };
  const minutes = now.getHours() * 60 + now.getMinutes();
  const toMin = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return (h ?? 0) * 60 + (m ?? 0);
  };
  for (const r of today.ranges) {
    if (minutes >= toMin(r.open) && minutes < toMin(r.close)) {
      return { state: 'open', label: `Abierto · cierra ${r.close}` };
    }
  }
  const next = today.ranges.find((r) => toMin(r.open) > minutes);
  return { state: 'closed', label: next ? `Cerrado · abre ${next.open}` : 'Cerrado por hoy' };
}

/** Color de texto legible (contraste AA) sobre un fondo hex. */
export function textOn(hex: string): '#ffffff' | '#1a1c19' {
  const c = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => {
    const v = parseInt(c.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  const L = 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  const vsWhite = 1.05 / (L + 0.05);
  const vsInk = (L + 0.05) / 0.0601;
  return vsWhite >= 4.5 || vsWhite >= vsInk ? '#ffffff' : '#1a1c19';
}
