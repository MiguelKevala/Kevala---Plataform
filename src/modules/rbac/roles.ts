export const ROLES = {
  SUPER_ADMIN: "Super Admin",
  ADMIN: "Admin",
  MANAGER: "Manager",
  OPERATOR: "Operator",
  VIEWER: "Viewer",
} as const;

export type RoleName = (typeof ROLES)[keyof typeof ROLES];
