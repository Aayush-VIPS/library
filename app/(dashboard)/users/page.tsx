import { redirect } from "next/navigation";
import { canManageSystem, currentAdmin, normalizeRole } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import { librariesList } from "@/lib/libraries";
import { Admin } from "@/lib/models";
import { UserManager } from "@/components/UserManager";
import { formatDateIST, formatIST } from "@/lib/time";

export default async function UsersPage() {
  const admin = await currentAdmin();
  if (!admin || !canManageSystem(admin)) redirect("/dashboard");
  await connectDB();
  const [rows, libraries] = await Promise.all([
    Admin.find({}).sort({ name: 1 }).lean(),
    librariesList(),
  ]);
  const users = (rows as any[]).map((user)=>({
    id:String(user._id),
    email:user.email,
    name:user.name,
    role:normalizeRole(user.role),
    assignedLibraryIds:user.assignedLibraryIds||[],
    active:user.active!==false,
    lastLoginAt:user.lastLoginAt?`${formatDateIST(user.lastLoginAt)} ${formatIST(user.lastLoginAt,true)}`:"",
  }));
  return <main className="page-wrap"><div className="page-heading"><span className="eyebrow">Access control</span><h2>Users & staff</h2><p>Create staff accounts, assign portal roles and restrict operational access to specific libraries.</p></div><section className="card table-card"><UserManager users={users} libraries={libraries}/></section></main>;
}
