import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { SESSION_DURATION_MS } from "./constants";

function generateToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export interface CreateSessionInput {
  userId: string;
  userAgent?: string | null;
  ipAddress?: string | null;
}

export async function createSession({ userId, userAgent, ipAddress }: CreateSessionInput) {
  const token = generateToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

  const session = await prisma.session.create({
    data: { userId, tokenHash, userAgent, ipAddress, expiresAt },
  });

  return { token, session };
}

export async function getSessionByToken(token: string) {
  const tokenHash = hashToken(token);

  const session = await prisma.session.findUnique({
    where: { tokenHash },
    include: { user: true },
  });

  if (!session) return null;
  if (session.revokedAt) return null;
  if (session.expiresAt < new Date()) return null;
  if (!session.user.isActive) return null;

  return session;
}

export async function revokeSessionByToken(token: string): Promise<void> {
  const tokenHash = hashToken(token);

  await prisma.session.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
