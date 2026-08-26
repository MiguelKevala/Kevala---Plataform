import { prisma } from "@/lib/prisma";
import { verifyPassword } from "./password";
import { createSession, revokeSessionByToken } from "./session";

export interface LoginContext {
  userAgent?: string | null;
  ipAddress?: string | null;
}

export type LoginResult =
  | { ok: true; token: string; expiresAt: Date }
  | { ok: false; error: "INVALID_CREDENTIALS" | "INACTIVE_USER" };

export async function login(
  email: string,
  password: string,
  context: LoginContext,
): Promise<LoginResult> {
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    return { ok: false, error: "INVALID_CREDENTIALS" };
  }

  const validPassword = await verifyPassword(user.passwordHash, password);
  if (!validPassword) {
    return { ok: false, error: "INVALID_CREDENTIALS" };
  }

  if (!user.isActive) {
    return { ok: false, error: "INACTIVE_USER" };
  }

  const { token, session } = await createSession({
    userId: user.id,
    userAgent: context.userAgent,
    ipAddress: context.ipAddress,
  });

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  return { ok: true, token, expiresAt: session.expiresAt };
}

export async function logout(token: string): Promise<void> {
  await revokeSessionByToken(token);
}
