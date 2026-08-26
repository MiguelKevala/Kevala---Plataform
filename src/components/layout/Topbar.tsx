import { BellIcon, UserIcon } from "./icons";

export function Topbar() {
  return (
    <header className="flex h-16 items-center justify-between border-b border-neutral-200 bg-white px-6">
      <span className="text-sm font-semibold tracking-wide text-neutral-500">KEVALA</span>

      <div className="flex items-center gap-4">
        <button
          type="button"
          aria-label="Notificaciones"
          className="flex h-9 w-9 items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-100"
        >
          <BellIcon className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-brand-800">
            <UserIcon className="h-4 w-4" />
          </span>
          <span className="text-sm font-medium text-neutral-700">Usuario</span>
        </div>
      </div>
    </header>
  );
}
