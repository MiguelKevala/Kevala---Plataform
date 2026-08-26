"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType, SVGProps } from "react";
import { cn } from "@/lib/cn";
import {
  DashboardIcon,
  InventoryIcon,
  MenuIcon,
  ProductsIcon,
  SettingsIcon,
  VendorIcon,
} from "./icons";

interface NavItem {
  label: string;
  href?: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
}

const navItems: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: DashboardIcon },
  { label: "Vendor", href: "/vendor", icon: VendorIcon },
  { label: "Inventario", icon: InventoryIcon },
  { label: "Productos", icon: ProductsIcon },
  { label: "Configuración", icon: SettingsIcon },
];

export interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside
      className={cn(
        "flex h-screen flex-col border-r border-neutral-200 bg-white transition-[width] duration-150",
        collapsed ? "w-16" : "w-64",
      )}
    >
      <div className="flex h-16 items-center gap-3 border-b border-neutral-200 px-4">
        <button
          type="button"
          onClick={onToggle}
          aria-label={collapsed ? "Expandir menú" : "Contraer menú"}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-neutral-600 hover:bg-neutral-100"
        >
          <MenuIcon className="h-5 w-5" />
        </button>
        {!collapsed && (
          <span className="truncate text-lg font-semibold tracking-wide text-brand-700">
            KEVALA
          </span>
        )}
      </div>

      <nav className="flex flex-1 flex-col gap-1 p-2">
        {navItems.map((item) => {
          const isActive = item.href ? pathname.startsWith(item.href) : false;
          const Icon = item.icon;
          const content = (
            <>
              <Icon className="h-5 w-5 shrink-0" />
              {!collapsed && <span className="truncate text-sm font-medium">{item.label}</span>}
            </>
          );

          if (!item.href) {
            return (
              <span
                key={item.label}
                aria-disabled="true"
                title={collapsed ? item.label : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-neutral-300",
                  collapsed && "justify-center",
                )}
              >
                {content}
              </span>
            );
          }

          return (
            <Link
              key={item.label}
              href={item.href}
              title={collapsed ? item.label : undefined}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 transition-colors",
                collapsed && "justify-center",
                isActive
                  ? "bg-brand-50 text-brand-800"
                  : "text-neutral-600 hover:bg-neutral-100",
              )}
            >
              {content}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
