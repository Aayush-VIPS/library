import { connectDB } from "@/lib/db";
import { Library } from "@/lib/models/Library";

export const LIBRARIES = [
  { id: "central", name: "Central Library" },
  { id: "law", name: "Law Library" },
  { id: "it", name: "IT Library" },
  { id: "business", name: "Business Library" },
  { id: "journalism", name: "Journalism Library" },
  { id: "meditation-room", name: "Meditation Room", location: "B Block" },
] as const;

export const DEFAULT_LIBRARY_ID = LIBRARIES[0].id;

export type LibraryId = (typeof LIBRARIES)[number]["id"];
export type LibraryOption = { id: string; name: string; location?: string; active?: boolean };

const libraryNameById = new Map<string, string>(LIBRARIES.map((library) => [library.id, library.name]));
let defaultsChecked = false;
let cachedLibraries: { includeInactive: boolean; expiresAt: number; rows: LibraryOption[] } | null = null;

export function invalidateLibrariesCache() {
  cachedLibraries = null;
}

export function libraryName(id: string | null | undefined) {
  return libraryNameById.get(id || "") || "Unassigned Library";
}

export function isLibraryId(value: unknown): value is LibraryId {
  return typeof value === "string" && libraryNameById.has(value);
}

export function normalizeLibraryId(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
}

export function libraryDisplayName(name: string, location?: string) {
  const cleanName = name.trim();
  if (/meditation/i.test(cleanName)) return cleanName || "Meditation Room";
  const cleanLocation = (location || "").trim().replace(/\s+/g, " ");
  if (!cleanLocation || !/\b(block|floor|wing|building|level)\b/i.test(cleanLocation)) return cleanName;
  return /\blibrary\b/i.test(cleanLocation) ? cleanLocation : cleanLocation + " Library";
}

export async function ensureDefaultLibraries() {
  await connectDB();
  if (defaultsChecked) return;
  const count = await Library.estimatedDocumentCount();
  if (count === 0) {
    await Library.insertMany(LIBRARIES.map((library) => ({
      libraryId: library.id,
      name: library.name,
      location: "location" in library ? library.location : "",
      active: true,
    })), { ordered: false });
  } else {
    const existingMeditationRoom = await Library.findOne({
      $or: [
        { libraryId: "meditation-room" },
        { name: /meditation/i },
      ],
    }).lean();
    if (!existingMeditationRoom) {
      await Library.create({
        libraryId: "meditation-room",
        name: "Meditation Room",
        location: "B Block",
        active: true,
      });
    }
  }
  defaultsChecked = true;
}

export async function librariesList(includeInactive = false): Promise<LibraryOption[]> {
  const now = Date.now();
  if (cachedLibraries && cachedLibraries.includeInactive === includeInactive && cachedLibraries.expiresAt > now) {
    return cachedLibraries.rows;
  }
  await ensureDefaultLibraries();
  const rows = await Library.find(includeInactive ? {} : { active: true }).sort({ name: 1 }).lean();
  const mapped = rows.map((library: any) => ({
    id: library.libraryId,
    name: libraryDisplayName(library.name, library.location),
    location: library.location || "",
    active: library.active !== false,
  }));
  for (const library of mapped) libraryNameById.set(library.id, library.name);
  cachedLibraries = { includeInactive, rows: mapped, expiresAt: now + 30_000 };
  return mapped;
}

export async function libraryNameMap() {
  const rows = await librariesList(true);
  return new Map(rows.map((library) => [library.id, library.name]));
}
