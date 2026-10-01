import { redirect } from "next/navigation";
import { getProfile } from "../../lib/auth";
import { supabaseAdmin } from "../../lib/supabase/admin";
import CreateUserForm from "./CreateUserForm";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const me = await getProfile();
  if (!me) redirect("/login?next=/admin");
  if (me.role !== "admin") redirect("/customer");

  const { data: profiles } = await supabaseAdmin()
    .from("profiles")
    .select("id, role, agent_id, full_name, created_at")
    .order("created_at", { ascending: true });

  return (
    <>
      <h1>ניהול</h1>
      <div style={{ display: "flex", gap: 32, flexWrap: "wrap", alignItems: "flex-start" }}>
        <CreateUserForm />
        <div style={{ flex: 1, minWidth: 320 }}>
          <h3 style={{ color: "#1e2a78" }}>משתמשים ({profiles?.length ?? 0})</h3>
          <div className="table-wrap">
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 380 }}>
            <thead>
              <tr style={{ textAlign: "right", borderBottom: "2px solid #1e2a78" }}>
                <th style={{ padding: 8 }}>שם</th><th>תפקיד</th><th>קוד סוכן</th>
              </tr>
            </thead>
            <tbody>
              {(profiles ?? []).map((p) => (
                <tr key={p.id} style={{ borderBottom: "1px solid #eee" }}>
                  <td style={{ padding: 8 }}>{p.full_name}</td>
                  <td>{p.role === "admin" ? "מנהל" : p.role === "agent" ? "סוכן" : p.role}</td>
                  <td>{p.agent_id ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      </div>
    </>
  );
}
