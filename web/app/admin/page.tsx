import { redirect } from "next/navigation";
import { getProfile } from "../../lib/auth";
import { supabaseAdmin } from "../../lib/supabase/admin";
import CreateUserForm from "./CreateUserForm";
import BannerForm from "./BannerForm";
import UserManager, { type ManagedUser } from "./UserManager";
import AdminPush from "./AdminPush";
import AdminTabs, { type Tab } from "./AdminTabs";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const me = await getProfile();
  if (!me) redirect("/login?next=/admin");
  if (me.role !== "admin") redirect("/");

  const admin = supabaseAdmin();
  const { data: profiles } = await admin
    .from("profiles").select("id, role, agent_id, full_name, created_at, push_prefs").order("created_at", { ascending: true });
  const { data: bannerRow } = await admin.from("app_settings").select("value").eq("key", "home_banner").single();
  const { data: authList } = await admin.auth.admin.listUsers({ perPage: 200 });
  const authById = new Map((authList?.users ?? []).map((u) => [u.id, u]));
  const now = Date.now();
  const users: ManagedUser[] = (profiles ?? []).map((p) => {
    const au = authById.get(p.id);
    const banned = au?.banned_until ? new Date(au.banned_until).getTime() > now : false;
    return {
      id: p.id, fullName: p.full_name, role: p.role, agentId: p.agent_id,
      email: au?.email ?? null, lastSignIn: au?.last_sign_in_at ?? null, createdAt: p.created_at, active: !banned,
      pushPrefs: (p.push_prefs as Record<string, boolean> | null) ?? null,
    };
  });

  const tabs: Tab[] = [
    {
      key: "users", label: "משתמשים", icon: "customers",
      content: (
        <div style={{ display: "flex", gap: 32, flexWrap: "wrap", alignItems: "flex-start" }}>
          <CreateUserForm />
          <div style={{ flex: 1, minWidth: 320 }}>
            <h3 style={{ color: "var(--brand-strong)" }}>משתמשים ({users.length})</h3>
            <UserManager users={users} meId={me.id} />
          </div>
        </div>
      ),
    },
    { key: "push", label: "התראות", icon: "bell", content: <AdminPush users={users} /> },
    { key: "banner", label: "באנר", icon: "home", content: <BannerForm banner={(bannerRow?.value as Record<string, string>) ?? {}} /> },
    { key: "rulers", label: "סרגלי מידות", icon: "ruler", content: <a href="/admin/rulers" className="btn btn-primary">פתח ניהול סרגלי מידות ←</a> },
  ];

  return (
    <>
      <h1>ניהול</h1>
      <AdminTabs tabs={tabs} />
    </>
  );
}
