export function currency(amount: number): string {
  return '$' + amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export function hours(h: number): string {
  return h > 0 ? h.toFixed(1) : '—';
}

export function initial(name: string): string {
  return (name || '?').charAt(0).toUpperCase();
}

export function initials(name: string): string {
  return name
    .split(' ')
    .map(w => w.charAt(0).toUpperCase())
    .slice(0, 2)
    .join('');
}

export function phone(num: string): string {
  const digits = num.replace(/\D/g, '');
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return num;
}

export function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  return str.slice(0, max - 1) + '\u2026';
}
