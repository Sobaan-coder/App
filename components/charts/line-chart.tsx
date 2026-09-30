"use client";
import { formatTick, formatValue, type ValueFormat } from "./format";
import { CartesianGrid, Line, LineChart as RLineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type Datum = { label: string; value: number | null };

/** Single-series line: 2px stroke, ≥8px markers, crosshair tooltip, accessible table. */
export function LineChart({ data, valueLabel, height = 240, domain, valueFormat = "number", caption }: { data: Datum[]; valueLabel: string; height?: number; domain?: [number, number]; valueFormat?: ValueFormat; caption: string }) {
  const format = (v: number) => formatValue(v, valueFormat);
  return (
    <figure>
      <div style={{ height }} aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <RLineChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: -12 }}>
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} minTickGap={12} />
            <YAxis domain={domain} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickFormatter={(v: number) => formatTick(v, valueFormat)} width={52} />
            <Tooltip
              cursor={{ stroke: "var(--muted-foreground)", strokeDasharray: "3 3" }}
              content={({ active, payload }) => {
                if (!active || !payload?.length || payload[0].value == null) return null;
                const d = payload[0].payload as Datum;
                return (
                  <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
                    <p className="font-medium">{d.label}</p>
                    <p className="text-muted-foreground">
                      {valueLabel}: <span className="font-medium text-foreground tabular-nums">{format(d.value!)}</span>
                    </p>
                  </div>
                );
              }}
            />
            <Line type="linear" dataKey="value" stroke="var(--primary)" strokeWidth={2} dot={{ r: 4, fill: "var(--primary)", stroke: "var(--card)", strokeWidth: 2 }} activeDot={{ r: 6 }} connectNulls isAnimationActive={false} />
          </RLineChart>
        </ResponsiveContainer>
      </div>
      <table className="sr-only">
        <caption>{caption}</caption>
        <tbody>
          {data.map((d, i) => (
            <tr key={`${d.label}-${i}`}>
              <td>{d.label}</td>
              <td>{d.value === null ? "no data" : format(d.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
