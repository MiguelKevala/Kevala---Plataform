import { getUserPermissions } from "./get-user-permissions";
import type { PermissionKey } from "./permissions";

export class ForbiddenError extends Error {
  constructor(public readonly permission: PermissionKey) {
    super(`Missing permission: ${permission}`);
    this.name = "ForbiddenError";
  }
}

export function isForbiddenError(error: unknown): error is ForbiddenError {
  return error instanceof ForbiddenError;
}

export async function requirePermission(userId: string, permission: PermissionKey): Promise<void> {
  const permissions = await getUserPermissions(userId);

  if (!permissions.has(permission)) {
    throw new ForbiddenError(permission);
  }
}
