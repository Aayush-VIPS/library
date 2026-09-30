import { redirect } from "next/navigation";
import { currentAdmin } from "@/lib/auth";

export async function requireCDC() {
  const admin = await currentAdmin();
  if (!admin) redirect("/login");
  if (admin.role !== "SUPER_ADMIN") redirect("/dashboard");
  return admin;
}

export async function requireCDCApi() {
  const admin = await currentAdmin();
  return admin?.role === "SUPER_ADMIN" ? admin : null;
}
