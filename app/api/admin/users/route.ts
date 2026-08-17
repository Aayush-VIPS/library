import { NextRequest } from "next/server";
import { z } from "zod";
import { requireSystemAdminApi, ROLES } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import { hashPassword } from "@/lib/crypto";
import { librariesList } from "@/lib/libraries";
import { Admin } from "@/lib/models";
import { jsonError, requireSameOrigin } from "@/lib/http";

const schema = z.object({
  email: z.string().email().max(200),
  name: z.string().min(2).max(120),
  password: z.string().min(8).max(200),
  role: z.enum(ROLES),
  assignedLibraryIds: z.array(z.string().min(1).max(40)).default([]),
});

export async function POST(req: NextRequest) {
  if (!(await requireSystemAdminApi())) return jsonError("Forbidden", 403);
  if (!requireSameOrigin(req)) return jsonError("Forbidden", 403);
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("Invalid user data.", 400);
  const libraries = await librariesList();
  const validLibraryIds = new Set(libraries.map((library) => library.id));
  if (parsed.data.role !== "SUPER_ADMIN" && !parsed.data.assignedLibraryIds.length) return jsonError("Assign at least one library for this role.", 400);
  if (parsed.data.assignedLibraryIds.some((id) => !validLibraryIds.has(id))) return jsonError("One or more assigned libraries do not exist.", 400);
  await connectDB();
  try {
    const user = await Admin.create({
      email: parsed.data.email.toLowerCase(),
      name: parsed.data.name,
      passwordHash: hashPassword(parsed.data.password),
      role: parsed.data.role,
      assignedLibraryIds: parsed.data.role === "SUPER_ADMIN" ? [] : parsed.data.assignedLibraryIds,
      active: true,
      sessionVersion: 0,
    });
    return Response.json({ success: true, id: String(user._id) }, { status: 201 });
  } catch (error: any) {
    if (error?.code === 11000) return jsonError("Email already exists.", 409);
    throw error;
  }
}
