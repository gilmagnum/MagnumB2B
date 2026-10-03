import { redirect } from "next/navigation";
import { getProfile } from "../../lib/auth";
import { supabaseAdmin } from "../../lib/supabase/admin";
import CreateUserForm from "./CreateUserForm";
import BannerForm from "./BannerForm";
import UserManager, { type ManagedUser } from "./UserManager";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const me = await getProfile();
  if (!me) redirect("/login?next=/admin");
  if (me.role !== "admin") redirect("/");

  const admin = supabaseAdmin();
  const { data: profiles } = await admin
    .from("profiles")
    .select("id, role, agent_id, full_name, created_at")
    .order("created_at", { ascending: true });
  const { data: bannerRow } = await admin.from("app_settings").select("value").eq("key", "home_banner").single();

  // Merge auth data (email, last login, banned/active) into the profile list.
  const { data: authList } = await admin.auth.admin.listUsers({ perPage: 200 });
  const authById = new Map((authList?.users ?? []).map((u) => [u.id, u]));
  const now = Date.now();
  const users: ManagedUser[] = (profiles ?? []).map((p) => {
    const au = authById.get(p.id);
    const banned = au?.banned_until ? new Date(au.banned_until).getTime() > now : false;
    return {
      id: p.id,
      fullName: p.full_name,
      role: p.role,
      agentId: p.agent_id,
      email: au?.email ?? null,
      lastSignIn: au?.last_sign_in_at ?? null,
      createdAt: p.created_at,
      active: !banned,
    };
  });

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
          <h3 style={{ color: "var(--brand-strong)" }}>משתמשים ({users.length})</h3>
          <UserManager users={users} meId={me.id} />
        </div>
      </div>
    </>
  );
}
