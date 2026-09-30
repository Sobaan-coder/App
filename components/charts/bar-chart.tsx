"use client";
import { Bar, BarChart as RBarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type Datum = { label: string; value: number; hint?: string };

/**
 * Single-series bar chart: one hue (primary), thin rounded bars anchored to the
 * baseline, recessive grid, hover tooltip, and an accessible data table.
 */
export function BarChart({
  data,
  valueLabel,
  horizontal = false,
  height = 260,
  format = (v: number) => String(Math.round(v * 10) / 10),
  caption,
}: {
  data: Datum[];
  valueLabel: string;
  horizontal?: boolean;
  height?: number;
  format?: (v: number) => string;
  caption: string;
}) {
  const h = horizontal ? Math.max(height, data.length * 34 + 40) : height;
  return (
    <figure>
      <div style={{ height: h }} aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <RBarChart data={data} layout={horizontal ? "vertical" : "horizontal"} margin={{ top: 8, right: 16, bottom: 4, left: horizontal ? 8 : -12 }} barCategoryGap={horizontal ? 8 : "25%"}>
            <CartesianGrid stroke="var(--border)" strokeDasharray="0" vertical={horizontal} horizontal={!horizontal} />
            {horizontal ? (
              <>
                <XAxis type="number" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickFormatter={format} />
                <YAxis type="category" dataKey="label" width={130} tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "var(--foreground)" }} interval={0} />
              </>
            ) : (
              <>
                <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} interval="preserveStartEnd" minTickGap={8} />
                <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickFormatter={format} width={44} />
              </>
            )}
            <Tooltip
              cursor={{ fill: "var(--accent)", opacity: 0.5 }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload as Datum;
                return (
                  <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
                    <p className="font-medium text-foreground">{d.label}</p>
                    <p className="text-muted-foreground">
                      {valueLabel}: <span className="font-medium text-foreground tabular-nums">{format(d.value)}</span>
                    </p>
                    {d.hint && <p className="text-muted-foreground">{d.hint}</p>}
                  </div>
                );
              }}
            />
            <Bar dataKey="value" fill="var(--primary)" radius={horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]} maxBarSize={horizontal ? 18 : 28} isAnimationActive={false} />
          </RBarChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="sr-only">{caption}</figcaption>
      <table className="sr-only">
        <caption>{caption}</caption>
        <thead>
          <tr>
            <th>Label</th>
            <th>{valueLabel}</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.label}>
              <td>{d.label}</td>
              <td>{format(d.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
