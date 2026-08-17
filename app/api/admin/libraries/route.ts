import { NextRequest } from "next/server";
import { z } from "zod";
import { requireSystemAdminApi } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import { invalidateLibrariesCache, normalizeLibraryId } from "@/lib/libraries";
import { Library } from "@/lib/models";
import { jsonError, requireSameOrigin } from "@/lib/http";

const schema = z.object({
  libraryId: z.string().min(2).max(40).optional(),
  name: z.string().min(2).max(100),
  location: z.string().max(160).optional().default(""),
});

export async function POST(req: NextRequest) {
  if (!(await requireSystemAdminApi())) return jsonError("Forbidden", 403);
  if (!requireSameOrigin(req)) return jsonError("Forbidden", 403);
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("Invalid library data.", 400);
  await connectDB();
  const libraryId = normalizeLibraryId(parsed.data.libraryId || parsed.data.name);
  if (!libraryId) return jsonError("Library ID is invalid.", 400);
  try {
    const library = await Library.create({
      libraryId,
      name: parsed.data.name,
      location: parsed.data.location,
      active: true,
    });
    invalidateLibrariesCache();
    return Response.json({ success: true, id: String(library._id), libraryId }, { status: 201 });
  } catch (error: any) {
    if (error?.code === 11000) return jsonError("Library ID already exists.", 409);
    throw error;
  }
}
