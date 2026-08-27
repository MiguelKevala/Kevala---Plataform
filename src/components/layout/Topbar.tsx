import { UserIcon } from "./icons";
import { LogoutButton } from "./LogoutButton";
import { NotificationsBell } from "./NotificationsBell";

export interface TopbarProps {
  userName: string;
}

export function Topbar({ userName }: TopbarProps) {
  return (
    <header className="flex h-16 items-center justify-between border-b border-neutral-200 bg-white px-6">
      <span className="text-sm font-semibold tracking-wide text-neutral-500">KEVALA</span>

      <div className="flex items-center gap-4">
        <NotificationsBell />

        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-brand-800">
            <UserIcon className="h-4 w-4" />
          </span>
          <span className="text-sm font-medium text-neutral-700">{userName}</span>
        </div>

        <LogoutButton />
      </div>
    </header>
  );
}
