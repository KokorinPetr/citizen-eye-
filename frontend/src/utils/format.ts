import { format, t } from "../i18n";

export function formatDistance(meters: number): string {
  return meters < 1000 ? `${Math.round(meters / 10) * 10} m` : `${(meters / 1000).toFixed(1)} km`;
}

export function timeAgo(iso: string, now: Date = new Date()): string {
  const minutes = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 60000));
  if (minutes < 1) return t.time.justNow;
  if (minutes < 60) return format(t.time.minutes, { n: minutes });
  const hours = Math.round(minutes / 60);
  if (hours < 24) return format(t.time.hours, { n: hours });
  return format(t.time.days, { n: Math.round(hours / 24) });
}

export function formatBaht(amount: number): string {
  return new Intl.NumberFormat("en-US").format(amount);
}
