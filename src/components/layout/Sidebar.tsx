"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { ComponentType, SVGProps } from "react";
import { cn } from "@/lib/cn";
import {
  DashboardIcon,
  InventoryIcon,
  MarketingIcon,
  MenuIcon,
  ProductsIcon,
  SettingsIcon,
  VendorIcon,
} from "./icons";

interface NavChild {
  label: string;
  href: string;
}

interface NavItem {
  label: string;
  href?: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  children?: NavChild[];
}

export interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  canManageCarriers: boolean;
  canManageModes: boolean;
  canViewProducts: boolean;
  canViewMarketingCosmo: boolean;
}

export function Sidebar({
  collapsed,
  onToggle,
  canManageCarriers,
  canManageModes,
  canViewProducts,
  canViewMarketingCosmo,
}: SidebarProps) {
  const settingsChildren: NavChild[] = [
    ...(canManageCarriers ? [{ label: "Carriers", href: "/settings/carriers" }] : []),
    ...(canManageModes ? [{ label: "Modes", href: "/settings/modes" }] : []),
  ];

  const navItems: NavItem[] = [
    { label: "Dashboard", href: "/dashboard", icon: DashboardIcon },
    {
      label: "Vendor",
      href: "/vendor",
      icon: VendorIcon,
      children: [
        { label: "Dashboard", href: "/vendor" },
        { label: "Orders", href: "/vendor/ordenes" },
        { label: "Pending", href: "/vendor/ordenes?status=PENDING" },
        { label: "History", href: "/vendor/ordenes?status=REJECTED,DELIVERED" },
      ],
    },
    { label: "Inventory", icon: InventoryIcon },
    ...(canViewProducts
      ? [
          {
            label: "Products",
            href: "/products/catalog",
            icon: ProductsIcon,
            children: [{ label: "Catalog", href: "/products/catalog" }],
          },
        ]
      : [{ label: "Products", icon: ProductsIcon }]),
    ...(canViewMarketingCosmo
      ? [
          {
            label: "Marketing",
            href: "/marketing/cosmo",
            icon: MarketingIcon,
            children: [{ label: "Cosmo - Algorithm", href: "/marketing/cosmo" }],
          },
        ]
      : [{ label: "Marketing", icon: MarketingIcon }]),
    ...(settingsChildren.length > 0
      ? [
          {
            label: "Settings",
            href: "/settings",
            icon: SettingsIcon,
            children: settingsChildren,
          },
        ]
      : [{ label: "Settings", icon: SettingsIcon }]),
  ];

  const pathname = usePathname();
  const searchParams = useSearchParams();

  function isChildActive(child: NavChild): boolean {
    if (child.href === "/vendor/ordenes?status=PENDING") {
      return pathname === "/vendor/ordenes" && searchParams.get("status") === "PENDING";
    }
    if (child.href === "/vendor/ordenes?status=REJECTED,DELIVERED") {
      return pathname === "/vendor/ordenes" && searchParams.get("status") === "REJECTED,DELIVERED";
    }
    if (child.href === "/vendor/ordenes") {
      return pathname === "/vendor/ordenes" && !searchParams.get("status");
    }
    return pathname === child.href;
  }

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
          aria-label={collapsed ? "Expand menu" : "Collapse menu"}
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

      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-2">
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
            <div key={item.label} className="flex flex-col gap-1">
              <Link
                href={item.href}
                title={collapsed ? item.label : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 transition-colors",
                  collapsed && "justify-center",
                  isActive ? "bg-brand-50 text-brand-800" : "text-neutral-600 hover:bg-neutral-100",
                )}
              >
                {content}
              </Link>

              {!collapsed && item.children && (
                <div className="ml-8 flex flex-col gap-1 border-l border-neutral-100 pl-3">
                  {item.children.map((child) => {
                    const childActive = isChildActive(child);
                    return (
                      <Link
                        key={child.label}
                        href={child.href}
                        className={cn(
                          "truncate rounded-md px-2 py-1.5 text-sm transition-colors",
                          childActive
                            ? "bg-brand-50 font-medium text-brand-800"
                            : "text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800",
                        )}
                      >
                        {child.label}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
