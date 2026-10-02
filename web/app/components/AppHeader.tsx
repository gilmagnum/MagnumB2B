"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { logout } from "../login/actions";
import { useOrderContext } from "../../lib/useOrderContext";
import { useCart } from "../../lib/useCart";
import HeaderSearch from "./HeaderSearch";

type Role = "agent" | "customer" | "picker" | "admin" | "";

// Top bar, RTL order (right → left): ☰ hamburger · title · user · customer(X) · 🛒 cart · search.
// Home + logout live inside the hamburger.
export default function AppHeader({ role, name }: { role: Role; name: string }) {
  const { ctx, exit } = useOrderContext();
  const { count, clear } = useCart();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Exiting a customer is like signing back out to the agent: confirm, empty the
  // cart, reset pricing (clearing ctx), and return home.
  const exitCustomer = () => {
    if (count > 0 && !window.confirm(`יציאה מהלקוח תרוקן את סל ההזמנה (${count} פריטים) ותחזור למחירון הכללי. להמשיך?`)) return;
    clear();
    exit();
    router.push("/");
  };
  const isAdmin = role === "admin";
  const canPick = role === "picker" || role === "admin";
  const pickerOnly = role === "picker";

  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, []);

  const links = pickerOnly
    ? [{ href: "/picking", label: "ליקוט" }]
    : [
        { href: "/", label: "בית" },
        { href: "/customer", label: "בחירת לקוח" },
        { href: "/catalog", label: "קטלוג" },
        { href: "/cart", label: "סל הזמנה" },
        { href: "/documents", label: "מסמכים" },
        ...(canPick ? [{ href: "/picking", label: "ליקוט" }] : []),
        ...(isAdmin ? [{ href: "/admin", label: "ניהול" }] : []),
      ];

  return (
    <header className="app-header">
      {/* hamburger (rightmost in RTL) */}
      <div ref={menuRef} style={{ position: "relative" }}>
        <button onClick={() => setOpen((o) => !o)} className="icon-btn" title="תפריט" aria-label="תפריט" aria-expanded={open}>☰</button>
        {open && (
          <div className="menu-pop">
            {links.map((l) => (
              <a key={l.href} href={l.href} className="menu-item" onClick={() => setOpen(false)}>{l.label}</a>
            ))}
            <form action={logout} style={{ display: "block", borderTop: "1px solid var(--border)", marginTop: 4, paddingTop: 4 }}>
              <button type="submit" className="menu-item" style={{ width: "100%", textAlign: "start", background: "none", border: 0, cursor: "pointer" }}>יציאה 🚪</button>
            </form>
          </div>
        )}
      </div>

      <a href={pickerOnly ? "/picking" : "/"} className="brand-logo hdr-title">מגנום · סיטונאות</a>

      {name && <span className="hdr-user" style={{ color: "var(--ink-muted)", fontSize: 13 }}>{name}</span>}

      {ctx && !pickerOnly && (
        <span className="chip chip-info hdr-customer" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ctx.customerName}</span>
          <button onClick={exitCustomer} title="יציאה מהלקוח" aria-label="יציאה מהלקוח"
            style={{ flex: "0 0 auto", border: 0, background: "rgba(0,0,0,.08)", borderRadius: 999, width: 16, height: 16, lineHeight: 1, cursor: "pointer", color: "inherit", fontSize: 11, display: "grid", placeItems: "center" }}>✕</button>
        </span>
      )}

      <div style={{ flex: 1 }} />

      {!pickerOnly && (
        <a href="/cart" className="icon-btn" title="סל" aria-label="סל" style={{ position: "relative" }}>
          🛒
          {count > 0 && (
            <span style={{ position: "absolute", top: -4, insetInlineEnd: -4, background: "var(--danger)", color: "#fff", borderRadius: 999, fontSize: 11, fontWeight: 700, minWidth: 18, height: 18, display: "grid", placeItems: "center", padding: "0 4px" }}>{count}</span>
          )}
        </a>
      )}

      {!pickerOnly && <HeaderSearch />}
    </header>
  );
}
