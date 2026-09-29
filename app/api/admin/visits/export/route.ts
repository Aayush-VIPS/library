import { NextRequest } from "next/server";
import { allowedLibraryIds, requireAdminApi } from "@/lib/auth";
import { visitHistory } from "@/lib/services/dashboard";
import { csvEscape } from "@/lib/csv";
import { formatIST } from "@/lib/time";
import { librariesList, libraryName } from "@/lib/libraries";

export async function GET(req: NextRequest) {
  const admin = await requireAdminApi();
  if (!admin) return new Response("Unauthorized", { status: 401 });
  const date = req.nextUrl.searchParams.get("date") || new Date().toISOString().slice(0, 10);
  const requestedLibrary = req.nextUrl.searchParams.get("library") || "all";
  const libraries = await librariesList();
  const libraryId = libraries.some((library) => library.id === requestedLibrary) ? requestedLibrary : "all";
  const parsedDate = new Date(`${date}T12:00:00+05:30`);
  if (Number.isNaN(parsedDate.getTime())) return new Response("Invalid date", { status: 400 });
  const visits: any[] = await visitHistory(parsedDate, "", allowedLibraryIds(admin, libraryId));
  const rows = [["Enrollment", "Name", "Course", "RFID", "Library", "IN", "OUT", "Exit Method", "IN Reader", "OUT Reader"]];
  for (const v of visits) {
    const s: any = v.studentId;
    rows.push([
      s?.enrollmentNumber || "", s?.name || "", s?.course || "", s?.rfidUid || "",
      libraryName(v.inLibraryId || (v.inDeviceId as any)?.libraryId),
      formatIST(v.inAt, true), v.outAt ? formatIST(v.outAt, true) : "",
      v.outMethod || "OPEN", (v.inDeviceId as any)?.name || "", (v.outDeviceId as any)?.name || "",
    ]);
  }
  const csv = rows.map((r) => r.map(csvEscape).join(",")).join("\n");
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="library-visits-${date}.csv"`,
      "cache-control": "no-store",
    },
  });
}
