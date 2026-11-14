import crypto from "node:crypto";
import bcrypt from "bcryptjs";

const SALT_ROUNDS = 10;

/** Melakukan hash password menggunakan bcrypt. */
export async function hashPassword(plainPassword: string): Promise<string> {
  return bcrypt.hash(plainPassword, SALT_ROUNDS);
}

/** Membandingkan password plain dengan hash bcrypt tersimpan. */
export async function comparePassword(
  plainPassword: string,
  passwordHash: string,
): Promise<boolean> {
  return bcrypt.compare(plainPassword, passwordHash);
}

/** Membuat hash SHA-256 deterministik untuk penyimpanan refresh token di DB. */
export function hashTokenSha256(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}
