"use client";
import Link from "next/link";
import { useState } from "react";
import { Users } from "lucide-react";
import { api, fmtDate, useApi } from "@/lib/client";
import { Badge, Button, Card, CardHeader, Input, PageHeader, Toggle, useToast } from "@/components/ui";

export default function AdminPage() {
  const toast = useToast();
  const users = useApi<{ users: { id: string; email: string; name: string; role: string; created_at: string; last_login_at: string | null; tasks: number; automations: number }[] }>("/api/admin/users");
  const tools = useApi<{ tools: { name: string; risk: string; enabledGlobally: boolean; category: string }[] }>("/api/tools");
  const [f, setF] = useState({ email: "", password: "", name: "" });
  if (users.error) return <Card className="p-6 text-sm text-muted">Admins only.</Card>;
  return (
    <div className="space-y-4">
      <PageHeader title="Admin" icon={<Users className="h-6 w-6" />} subtitle="Users, global tool switches and system links." />
      <div className="grid gap-3 sm:grid-cols-4">
        {[
          ["/health", "System health"],
          ["/activity", "Logs"],
          ["/usage", "AI models & usage"],
          ["/approvals?status=all", "Approvals history"],
          ["/automations", "Automations"],
          ["/files", "Files"],
          ["/settings", "Permissions & settings"],
          ["/content/accounts", "Integrations"],
        ].map(([href, label]) => (
          <Link key={href} href={href} className="rounded-2xl border border-line bg-panel p-4 text-sm font-medium hover:border-accent">
            {label} →
          </Link>
        ))}
      </div>
      <Card className="overflow-hidden">
        <CardHeader title="Users" />
        <div className="divide-y divide-line">
          {users.data?.users.map((u) => (
            <div key={u.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
              <div className="min-w-0 flex-1">
                <div className="font-medium">
                  {u.name} <span className="text-muted">· {u.email}</span>
                </div>
                <div className="text-xs text-muted">
                  joined {fmtDate(u.created_at, { dateStyle: "medium" })} · last login {fmtDate(u.last_login_at)} · {u.tasks} tasks · {u.automations} automations
                </div>
              </div>
              <Badge tone={u.role === "admin" ? "accent" : "neutral"}>{u.role}</Badge>
            </div>
          ))}
        </div>
        <form
          className="grid gap-2 border-t border-line p-5 sm:grid-cols-4"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await api("/api/admin/users", { body: f });
              setF({ email: "", password: "", name: "" });
              users.reload();
              toast("User created", "ok");
            } catch (err) {
              toast((err as Error).message, "bad");
            }
          }}
        >
          <Input placeholder="Name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          <Input placeholder="Email" type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
          <Input placeholder="Password (10+ chars)" type="password" required value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
          <Button type="submit" variant="primary">
            Add user
          </Button>
        </form>
      </Card>
      <Card className="overflow-hidden">
        <CardHeader title="Tools (global switch)" subtitle="Disable a tool for every user." />
        <div className="grid gap-x-6 px-5 pb-5 sm:grid-cols-2 lg:grid-cols-3">
          {tools.data?.tools.map((t) => (
            <div key={t.name} className="flex items-center justify-between border-b border-line py-2 text-xs">
              <span>
                {t.name} <span className="text-muted">({t.risk})</span>
              </span>
              <Toggle
                checked={t.enabledGlobally}
                onChange={async (v) => {
                  await api("/api/tools", { method: "PUT", body: { tool: t.name, enabledGlobally: v } });
                  tools.reload();
                }}
              />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
