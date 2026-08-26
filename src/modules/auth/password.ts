import { hash, verify } from "@node-rs/argon2";

// @node-rs/argon2's default algorithm is already Argon2id.
export async function hashPassword(password: string): Promise<string> {
  return hash(password);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  return verify(passwordHash, password);
}
