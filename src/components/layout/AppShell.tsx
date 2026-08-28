"use client";

import { useState, type ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

export interface AppShellProps {
  children: ReactNode;
  userName: string;
  canManageCarriers: boolean;
  canManageModes: boolean;
  canViewProducts: boolean;
}

export function AppShell({
  children,
  userName,
  canManageCarriers,
  canManageModes,
  canViewProducts,
}: AppShellProps) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="flex min-h-screen bg-neutral-50">
      <Sidebar
        collapsed={collapsed}
        onToggle={() => setCollapsed((value) => !value)}
        canManageCarriers={canManageCarriers}
        canManageModes={canManageModes}
        canViewProducts={canViewProducts}
      />
      <div className="flex min-h-screen flex-1 flex-col">
        <Topbar userName={userName} />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
