export type ValueFormat = "number" | "percent" | "minutes";

export function formatValue(v: number, f: ValueFormat = "number") {
  if (f === "percent") return `${Math.round(v)}%`;
  if (f === "minutes") return v >= 60 ? `${Math.floor(v / 60)}h ${Math.round(v % 60)}m` : `${Math.round(v)}m`;
  return String(Math.round(v * 10) / 10);
}

/** Compact axis ticks (never wrap). */
export function formatTick(v: number, f: ValueFormat = "number") {
  if (f === "minutes") return v >= 60 ? `${Math.round((v / 60) * 10) / 10}h` : `${Math.round(v)}m`;
  return formatValue(v, f);
}
