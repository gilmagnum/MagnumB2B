import { redirect } from "next/navigation";
import { getProfile } from "../../lib/auth";
import { supabaseAdmin } from "../../lib/supabase/admin";
import CreateUserForm from "./CreateUserForm";
import BannerForm from "./BannerForm";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const me = await getProfile();
  if (!me) redirect("/login?next=/admin");
  if (me.role !== "admin") redirect("/customer");

  const admin = supabaseAdmin();
  const { data: profiles } = await admin
    .from("profiles")
    .select("id, role, agent_id, full_name, created_at")
    .order("created_at", { ascending: true });
  const { data: bannerRow } = await admin.from("app_settings").select("value").eq("key", "home_banner").single();

  return (
    <>
      <h1>ניהול</h1>
      <div style={{ marginBottom: 16, display: "flex", gap: 10, flexWrap: "wrap" }}>
        <a href="/admin/rulers" className="btn">📏 סרגלי מידות</a>
      </div>
      <div style={{ display: "flex", gap: 32, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div style={{ display: "grid", gap: 20 }}>
          <CreateUserForm />
          <BannerForm banner={(bannerRow?.value as Record<string, string>) ?? {}} />
        </div>
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
                  <td>{p.role === "admin" ? "מנהל" : p.role === "agent" ? "סוכן" : p.role === "picker" ? "מלקט" : p.role}</td>
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
