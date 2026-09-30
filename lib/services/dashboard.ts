import { connectDB } from "@/lib/db";
import { DEFAULT_LIBRARY_ID, librariesList, libraryName } from "@/lib/libraries";
import { Device, LibraryVisit, ScanEvent, Student } from "@/lib/models";
import { autoCloseDueVisits } from "@/lib/services/auto-close";
import { dayBoundsIST } from "@/lib/time";

type LibraryScope = string | string[] | "all";

function normalizeScope(libraryId: LibraryScope = "all") {
  return Array.isArray(libraryId) ? libraryId.filter(Boolean) : libraryId;
}

function visitLibraryFilter(libraryId: LibraryScope = "all") {
  libraryId = normalizeScope(libraryId);
  if (libraryId === "all") return {};
  if (Array.isArray(libraryId)) {
    return libraryId.includes(DEFAULT_LIBRARY_ID)
      ? { $or: [{ inLibraryId: { $in: libraryId } }, { inLibraryId: { $exists: false } }] }
      : { inLibraryId: { $in: libraryId } };
  }
  if (libraryId === DEFAULT_LIBRARY_ID) {
    return { $or: [{ inLibraryId: DEFAULT_LIBRARY_ID }, { inLibraryId: { $exists: false } }] };
  }
  return { inLibraryId: libraryId };
}

function scanLibraryFilter(libraryId: LibraryScope = "all") {
  libraryId = normalizeScope(libraryId);
  if (libraryId === "all") return {};
  if (Array.isArray(libraryId)) {
    return libraryId.includes(DEFAULT_LIBRARY_ID)
      ? { $or: [{ libraryId: { $in: libraryId } }, { libraryId: { $exists: false } }] }
      : { libraryId: { $in: libraryId } };
  }
  if (libraryId === DEFAULT_LIBRARY_ID) {
    return { $or: [{ libraryId: DEFAULT_LIBRARY_ID }, { libraryId: { $exists: false } }] };
  }
  return { libraryId };
}

function deviceLibraryFilter(libraryId: LibraryScope = "all") {
  libraryId = normalizeScope(libraryId);
  if (libraryId === "all") return { deviceType: "LIBRARY_GATE" };
  if (Array.isArray(libraryId)) {
    return libraryId.includes(DEFAULT_LIBRARY_ID)
      ? { deviceType: "LIBRARY_GATE", $or: [{ libraryId: { $in: libraryId } }, { libraryId: { $exists: false } }] }
      : { deviceType: "LIBRARY_GATE", libraryId: { $in: libraryId } };
  }
  if (libraryId === DEFAULT_LIBRARY_ID) {
    return { deviceType: "LIBRARY_GATE", $or: [{ libraryId: DEFAULT_LIBRARY_ID }, { libraryId: { $exists: false } }] };
  }
  return { deviceType: "LIBRARY_GATE", libraryId };
}

export async function dashboardSummary(now = new Date(), libraryId: LibraryScope = "all") {
  await connectDB();
  await autoCloseDueVisits(now);
  const { open, close } = dayBoundsIST(now);
  const onlineSince = new Date(now.getTime() - 5 * 60_000);
  const visitFilter = visitLibraryFilter(libraryId);
  const deviceFilter = deviceLibraryFilter(libraryId);
  const libraries = await librariesList(true);

  const [visitsToday, inside, onlineDevices, totalDevices, uniqueRows, hourly, recent, visitGroups, deviceRows] = await Promise.all([
    LibraryVisit.countDocuments({ ...visitFilter, inAt: { $gte: open, $lt: close } }),
    LibraryVisit.countDocuments({ ...visitFilter, inAt: { $gte: open, $lt: close }, outAt: { $exists: false } }),
    Device.countDocuments({ ...deviceFilter, active: true, lastSeenAt: { $gte: onlineSince } }),
    Device.countDocuments({ ...deviceFilter, active: true }),
    LibraryVisit.distinct("studentId", { ...visitFilter, inAt: { $gte: open, $lt: close } }),
    LibraryVisit.aggregate([
      { $match: { ...visitFilter, inAt: { $gte: open, $lt: close } } },
      { $group: { _id: { $hour: { date: "$inAt", timezone: "Asia/Kolkata" } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
    ScanEvent.find(scanLibraryFilter(libraryId)).sort({ receivedAt: -1 }).limit(8).populate("studentId", "name enrollmentNumber course").populate("deviceId", "name libraryId").lean(),
    LibraryVisit.aggregate([
      { $match: { inAt: { $gte: open, $lt: close } } },
      { $project: { libraryId: { $ifNull: ["$inLibraryId", DEFAULT_LIBRARY_ID] }, open: { $cond: [{ $not: ["$outAt"] }, 1, 0] } } },
      { $group: { _id: "$libraryId", visitsToday: { $sum: 1 }, inside: { $sum: "$open" } } },
    ]),
    Device.find({ active: true, deviceType: "LIBRARY_GATE" }).select("libraryId lastSeenAt").lean(),
  ]);

  const footfall = Array.from({ length: 9 }, (_, i) => ({ hour: i + 9, count: 0 }));
  for (const row of hourly) {
    const target = footfall.find((x) => x.hour === row._id);
    if (target) target.count = row.count;
  }

  const visibleLibraries = Array.isArray(libraryId) ? libraries.filter((library) => libraryId.includes(library.id)) : libraries;
  const perLibrary = visibleLibraries.map((library) => {
    const visits = visitGroups.find((row) => row._id === library.id);
    const devices = deviceRows.filter((device: any) => (device.libraryId || DEFAULT_LIBRARY_ID) === library.id);
    return {
      id: library.id,
      name: library.name,
      inside: visits?.inside || 0,
      visitsToday: visits?.visitsToday || 0,
      onlineDevices: devices.filter((device: any) => device.lastSeenAt && new Date(device.lastSeenAt) >= onlineSince).length,
      totalDevices: devices.length,
    };
  });

  return { inside, uniqueVisitors: uniqueRows.length, visitsToday, onlineDevices, totalDevices, footfall, recent, perLibrary, selectedLibraryName: libraryId === "all" || Array.isArray(libraryId) ? "All Libraries" : libraryName(libraryId) };
}

export async function currentInside(now = new Date(), libraryId: LibraryScope = "all") {
  await connectDB();
  await autoCloseDueVisits(now);
  const { open, close } = dayBoundsIST(now);
  return LibraryVisit.find({ ...visitLibraryFilter(libraryId), inAt: { $gte: open, $lt: close }, outAt: { $exists: false } })
    .sort({ inAt: -1 })
    .populate("studentId", "name enrollmentNumber course batch section rfidUid")
    .populate("inDeviceId", "name libraryId")
    .lean();
}

export async function visitHistory(date: Date, query = "", libraryId: LibraryScope = "all") {
  await connectDB();
  await autoCloseDueVisits();
  const { open, close } = dayBoundsIST(date);
  const visits: any[] = await LibraryVisit.find({ ...visitLibraryFilter(libraryId), inAt: { $gte: open, $lt: close } })
    .sort({ inAt: -1 })
    .limit(1000)
    .populate("studentId", "name enrollmentNumber course batch section rfidUid")
    .populate("inDeviceId", "name libraryId")
    .populate("outDeviceId", "name libraryId")
    .lean();
  if (!query) return visits;
  const needle = query.toLowerCase();
  return visits.filter((v) => {
    const s: any = v.studentId;
    return `${s?.name || ""} ${s?.enrollmentNumber || ""} ${s?.course || ""} ${s?.rfidUid || ""}`.toLowerCase().includes(needle);
  });
}

export async function studentsList(query = "") {
  await connectDB();
  const safeQuery = query.slice(0, 120).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const filter = safeQuery ? {
    $or: [
      { name: { $regex: safeQuery, $options: "i" } },
      { enrollmentNumber: { $regex: safeQuery, $options: "i" } },
      { rfidUid: { $regex: safeQuery, $options: "i" } },
      { course: { $regex: safeQuery, $options: "i" } },
    ],
  } : {};
  return Student.find(filter).sort({ name: 1 }).limit(2000).lean();
}

export async function devicesList(libraryId: LibraryScope = "all") {
  await connectDB();
  return Device.find(deviceLibraryFilter(libraryId)).sort({ name: 1 }).lean();
}

export async function eventHistory(libraryId: LibraryScope = "all") {
  await connectDB();
  return ScanEvent.find(scanLibraryFilter(libraryId)).sort({ receivedAt: -1 }).limit(500)
    .populate("studentId", "name enrollmentNumber")
    .populate("deviceId", "name macAddress libraryId")
    .lean();
}
