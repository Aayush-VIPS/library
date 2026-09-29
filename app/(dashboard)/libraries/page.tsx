import { redirect } from "next/navigation";
import { canManageSystem, currentAdmin } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import { ensureDefaultLibraries, libraryDisplayName } from "@/lib/libraries";
import { Library } from "@/lib/models";
import { LibraryManager } from "@/components/LibraryManager";

export default async function LibrariesPage() {
  const admin = await currentAdmin();
  if (!admin || !canManageSystem(admin)) redirect("/dashboard");
  await ensureDefaultLibraries();
  await connectDB();
  const rows:any[] = await Library.find({}).sort({ name: 1 }).lean();
  const libraries = rows.map((library)=>({
    id:String(library._id),
    libraryId:library.libraryId,
    name:library.name,
    displayName:libraryDisplayName(library.name, library.location),
    location:library.location||"",
    active:library.active!==false,
  }));
  return <main className="page-wrap"><div className="page-heading"><span className="eyebrow">System setup</span><h2>Libraries</h2><p>Create and maintain the library branches used for reader assignment, occupancy views and staff access scopes.</p></div><section className="card table-card"><LibraryManager libraries={libraries}/></section></main>;
}
