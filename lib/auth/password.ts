import bcrypt from "bcryptjs";

export const hashPassword = (plain: string) => bcrypt.hash(plain, 12);
export const verifyPassword = (plain: string, hash: string) => bcrypt.compare(plain, hash);

/** Minimal password policy: 10+ chars, not all one character class. */
export function passwordProblems(pw: string): string | null {
  if (pw.length < 10) return "Password must be at least 10 characters";
  if (pw.length > 200) return "Password is too long";
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(pw)).length;
  if (classes < 2) return "Use at least two of: lowercase, uppercase, digits, symbols";
  return null;
}
