"use client";
import { useRouter } from "next/navigation";

export function SubjectSwitcher({ subjects, current, basePath, allowAll = false }: { subjects: { id: string; name: string }[]; current: string | null; basePath: string; allowAll?: boolean }) {
  const router = useRouter();
  if (subjects.length <= 1 && !allowAll) return null;
  return (
    <select
      aria-label="Subject"
      value={current ?? ""}
      onChange={(e) => router.push(e.target.value ? `${basePath}?subject=${e.target.value}` : basePath)}
      className="h-10 rounded-xl border border-input bg-card px-3 text-sm"
    >
      {allowAll && <option value="">All subjects</option>}
      {subjects.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name}
        </option>
      ))}
    </select>
  );
}
