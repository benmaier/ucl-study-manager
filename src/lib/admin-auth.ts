import { cookies } from "next/headers";

/**
 * Check if the current request has valid admin authentication.
 * Returns true if the admin_token cookie matches ADMIN_PASSWORD env var.
 */
export async function isAdminAuthenticated(): Promise<boolean> {
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) return false;

  const cookieStore = await cookies();
  const token = cookieStore.get("admin_token")?.value;
  return token === adminPassword;
}
