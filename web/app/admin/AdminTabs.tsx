"use client";
import { useState, type ReactNode } from "react";
import Icon from "../components/Icon";

export type Tab = { key: string; label: string; icon: string; content: ReactNode };

export default function AdminTabs({ tabs }: { tabs: Tab[] }) {
  const [active, setActive] = useState(tabs[0]?.key);
  return (
    <>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20, borderBottom: "1px solid var(--border)", paddingBottom: 10 }}>
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setActive(t.key)}
            className={active === t.key ? "btn btn-primary btn-sm" : "btn btn-sm"}
            style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <Icon name={t.icon} size={17} /> {t.label}
          </button>
        ))}
      </div>
      {tabs.map((t) => (
        <div key={t.key} style={{ display: active === t.key ? "block" : "none" }}>{t.content}</div>
      ))}
    </>
  );
}
