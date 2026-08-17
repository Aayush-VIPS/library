import { NextRequest } from "next/server";
import { z } from "zod";
import { requireSystemAdminApi, ROLES } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import { hashPassword } from "@/lib/crypto";
import { librariesList } from "@/lib/libraries";
import { Admin } from "@/lib/models";
import { jsonError, requireSameOrigin } from "@/lib/http";

const schema = z.object({
  email: z.string().email().max(200).optional(),
  name: z.string().min(2).max(120).optional(),
  password: z.string().min(8).max(200).optional().or(z.literal("")),
  role: z.enum(ROLES).optional(),
  assignedLibraryIds: z.array(z.string().min(1).max(40)).optional(),
  active: z.boolean().optional(),
});

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const actor = await requireSystemAdminApi();
  if (!actor) return jsonError("Forbidden", 403);
  if (!requireSameOrigin(req)) return jsonError("Forbidden", 403);
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("Invalid user data.", 400);
  const { id } = await ctx.params;
  if (id === actor.id && parsed.data.active === false) return jsonError("You cannot disable your own account.", 409);
  const libraries = await librariesList();
  const validLibraryIds = new Set(libraries.map((library) => library.id));
  const update: Record<string, unknown> = {};
  if (parsed.data.email) update.email = parsed.data.email.toLowerCase();
  if (parsed.data.name) update.name = parsed.data.name;
  if (parsed.data.role) update.role = parsed.data.role;
  if (parsed.data.active !== undefined) update.active = parsed.data.active;
  if (parsed.data.password) update.passwordHash = hashPassword(parsed.data.password);
  if (parsed.data.assignedLibraryIds) {
    if (parsed.data.assignedLibraryIds.some((libraryId) => !validLibraryIds.has(libraryId))) return jsonError("One or more assigned libraries do not exist.", 400);
    update.assignedLibraryIds = parsed.data.role === "SUPER_ADMIN" ? [] : parsed.data.assignedLibraryIds;
  }
  if (parsed.data.role === "SUPER_ADMIN") update.assignedLibraryIds = [];
  const shouldInvalidateSessions = Object.keys(update).some((key) => ["role", "active", "passwordHash", "assignedLibraryIds"].includes(key));
  await connectDB();
  try {
    const user = await Admin.findByIdAndUpdate(id, { $set: update, ...(shouldInvalidateSessions ? { $inc: { sessionVersion: 1 } } : {}) }, { returnDocument: "after" });
    if (!user) return jsonError("User not found.", 404);
    return Response.json({ success: true });
  } catch (error: any) {
    if (error?.code === 11000) return jsonError("Email already exists.", 409);
    throw error;
  }
}
