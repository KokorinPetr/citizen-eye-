import { en, type Dictionary } from "./en";

/** Current language. Thai later: pick `th` here (e.g. from a setting). */
export const t: Dictionary = en;

/** Fill `{name}` placeholders: format(t.incident.peopleGoing, { going: 2, needed: 4 }). */
export function format(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match,
  );
}
