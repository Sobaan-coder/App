// Friendly auth messages — never show raw provider errors to students.
export function friendlyAuthError(message: string | undefined): string {
  const m = (message ?? "").toLowerCase();
  if (m.includes("invalid login credentials")) return "That email and password don't match. Try again or reset your password.";
  if (m.includes("email not confirmed")) return "Please verify your email first — check your inbox for the link.";
  if (m.includes("already registered") || m.includes("already been registered")) return "An account with this email already exists. Try signing in.";
  if (m.includes("password") && (m.includes("at least") || m.includes("weak"))) return "Choose a stronger password (at least 8 characters).";
  if (m.includes("rate limit") || m.includes("too many")) return "Too many attempts. Please wait a minute and try again.";
  if (m.includes("same password") || m.includes("different from the old")) return "Your new password must be different from the old one.";
  return "Something went wrong. Please try again.";
}
