export const PERMISSIONS = {
  USERS_VIEW: "users.view",
  USERS_MANAGE: "users.manage",
  ROLES_VIEW: "roles.view",
  ROLES_MANAGE: "roles.manage",
  AUDIT_VIEW: "audit.view",
  VENDOR_VIEW: "vendor.view",
  VENDOR_ORDERS_VIEW: "vendor.orders.view",
  VENDOR_ORDERS_CONFIRM: "vendor.orders.confirm",
  VENDOR_ORDERS_REJECT: "vendor.orders.reject",
  VENDOR_ORDERS_DELIVER: "vendor.orders.deliver",
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];
