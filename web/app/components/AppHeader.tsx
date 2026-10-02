"use client";
import { useEffect, useRef, useState } from "react";
import { logout } from "../login/actions";
import { useOrderContext } from "../../lib/useOrderContext";
import { useCart } from "../../lib/useCart";
import HeaderSearch from "./HeaderSearch";

type Role = "agent" | "customer" | "picker" | "admin" | "";

// Primary icons stay on the bar; secondary links live in the hamburger menu.
export default function AppHeader({ role, name }: { role: Role; name: string }) {
  const { ctx } = useOrderContext();
  const { count } = useCart();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const isAdmin = role === "admin";
  const canPick = role === "picker" || role === "admin";
  const pickerOnly = role === "picker";

  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, []);

  const menuLinks = pickerOnly
    ? [{ href: "/picking", label: "ליקוט" }]
    : [
        { href: "/customer", label: "בחירת לקוח" },
        { href: "/catalog", label: "קטלוג" },
        { href: "/documents", label: "מסמכים" },
        ...(canPick ? [{ href: "/picking", label: "ליקוט" }] : []),
        ...(isAdmin ? [{ href: "/admin", label: "ניהול" }] : []),
      ];

  const home = pickerOnly ? "/picking" : "/";

  return (
    <header className="app-header">
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <a href={home} className="brand-logo">מגנום · סיטונאות</a>
        {ctx && !pickerOnly && (
          <span className="chip chip-info" title="מזמין עבור לקוח">לקוח: {ctx.customerName}</span>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {!pickerOnly && <HeaderSearch />}
        <a href={home} className="icon-btn" title="בית" aria-label="בית">🏠</a>
        {!pickerOnly && (
          <a href="/cart" className="icon-btn" title="סל" aria-label="סל" style={{ position: "relative" }}>
            🛒
            {count > 0 && (
              <span style={{ position: "absolute", top: -4, insetInlineEnd: -4, background: "var(--danger)", color: "#fff", borderRadius: 999, fontSize: 11, fontWeight: 700, minWidth: 18, height: 18, display: "grid", placeItems: "center", padding: "0 4px" }}>{count}</span>
            )}
          </a>
        )}
        {name && <span style={{ color: "var(--ink-muted)", fontSize: 13, maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>}
        <form action={logout} style={{ display: "inline" }}>
          <button type="submit" className="icon-btn" title="יציאה" aria-label="יציאה">🚪</button>
        </form>
        <div ref={menuRef} style={{ position: "relative" }}>
          <button onClick={() => setOpen((o) => !o)} className="icon-btn" title="תפריט" aria-label="תפריט" aria-expanded={open}>☰</button>
          {open && (
            <div className="menu-pop">
              {menuLinks.map((l) => (
                <a key={l.href} href={l.href} className="menu-item" onClick={() => setOpen(false)}>{l.label}</a>
              ))}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
