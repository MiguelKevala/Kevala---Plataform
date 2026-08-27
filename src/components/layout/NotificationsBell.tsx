"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { cn } from "@/lib/cn";
import { BellIcon } from "./icons";

interface NotificationItem {
  id: string;
  title: string;
  message: string;
  entityType: string | null;
  entityId: string | null;
  readAt: string | null;
}

export function NotificationsBell() {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);

  async function fetchNotifications() {
    setLoading(true);
    try {
      const response = await fetch("/api/notifications");
      if (!response.ok) return;
      const data = await response.json();
      setItems(data.items ?? []);
      setUnreadCount(data.unreadCount ?? 0);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;

    fetch("/api/notifications")
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!active || !data) return;
        setItems(data.items ?? []);
        setUnreadCount(data.unreadCount ?? 0);
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!open) return;

    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  async function handleToggle() {
    const next = !open;
    setOpen(next);
    if (next) {
      await fetchNotifications();
    }
  }

  function handleSelect(notification: NotificationItem) {
    if (!notification.readAt) {
      setItems((prev) =>
        prev.map((item) =>
          item.id === notification.id ? { ...item, readAt: new Date().toISOString() } : item,
        ),
      );
      setUnreadCount((count) => Math.max(0, count - 1));
      fetch(`/api/notifications/${notification.id}/read`, { method: "POST" }).catch(() => {});
    }

    setOpen(false);

    if (notification.entityType === "VendorOrder" && notification.entityId) {
      router.push(`/vendor/ordenes/${notification.entityId}`);
    }
  }

  async function handleMarkAllAsRead() {
    setItems((prev) =>
      prev.map((item) => ({ ...item, readAt: item.readAt ?? new Date().toISOString() })),
    );
    setUnreadCount(0);
    try {
      await fetch("/api/notifications/read-all", { method: "POST" });
    } catch {
      // Si falla, el próximo fetch al reabrir el dropdown reconcilia el estado real.
    }
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        aria-label="Notifications"
        onClick={handleToggle}
        className="relative flex h-9 w-9 items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-100"
      >
        <BellIcon className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-20 flex w-80 flex-col rounded-lg border border-neutral-200 bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
            <span className="text-sm font-semibold text-neutral-900">Notifications</span>
            {unreadCount > 0 && (
              <Button variant="ghost" size="sm" onClick={handleMarkAllAsRead}>
                Mark all as read
              </Button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {loading && items.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-neutral-500">Loading...</p>
            ) : items.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-neutral-500">You have no notifications.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-neutral-100">
                {items.map((notification) => (
                  <li key={notification.id}>
                    <button
                      type="button"
                      onClick={() => handleSelect(notification)}
                      className={cn(
                        "flex w-full flex-col gap-1 px-4 py-3 text-left hover:bg-neutral-50",
                        !notification.readAt && "bg-brand-50/50",
                      )}
                    >
                      <div className="flex items-center gap-2">
                        {!notification.readAt && <span className="h-2 w-2 shrink-0 rounded-full bg-brand-600" />}
                        <span className="text-sm font-medium text-neutral-900">{notification.title}</span>
                      </div>
                      <span className="text-sm text-neutral-600">{notification.message}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
