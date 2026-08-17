import { devicesList } from "@/lib/services/dashboard";
import { DeviceManager } from "@/components/DeviceManager";
import { formatDateIST, formatIST } from "@/lib/time";
import { AutoRefresh } from "@/components/AutoRefresh";
import { allowedLibraryIds, canManageSystem, currentAdmin } from "@/lib/auth";
import { DEFAULT_LIBRARY_ID, librariesList } from "@/lib/libraries";

export default async function DevicesPage(){
 const admin=await currentAdmin();const now=Date.now();const libraries=await librariesList();const visibleLibraries=admin?.role==="SUPER_ADMIN"?libraries:libraries.filter((library)=>admin?.assignedLibraryIds.includes(library.id));const rows:any[]=await devicesList(admin?allowedLibraryIds(admin,"all"):[]);const devices=rows.map(d=>({id:String(d._id),name:d.name,macAddress:d.macAddress,libraryId:d.libraryId||DEFAULT_LIBRARY_ID,active:d.active,online:d.active&&d.lastSeenAt&&now-new Date(d.lastSeenAt).getTime()<5*60_000,rssi:d.rssi,queueDepth:d.queueDepth||0,clockReady:!!d.clockReady,firmwareVersion:d.firmwareVersion||"",lastSeen:d.lastSeenAt?`${formatDateIST(d.lastSeenAt)} ${formatIST(d.lastSeenAt,true)}`:"Never"}));
 return <main className="page-wrap"><AutoRefresh/><div className="page-heading"><span className="eyebrow">Hardware fleet</span><h2>RFID readers</h2><p>Assign each ESP32 reader to the library where it is installed. Scans from that device will count toward that library’s occupancy and history.</p></div><div className="notice warn">A reader appears offline when its last heartbeat is older than five minutes. Disabling a reader immediately blocks future heartbeat and scan authentication.</div>{devices.length?<DeviceManager devices={devices} libraries={visibleLibraries} canManage={!!admin&&canManageSystem(admin)}/>:<section className="card"><div className="empty">No reader has enrolled yet. Flash the ESP firmware, configure Wi-Fi, and let it call <code>/api/device/register</code>.</div></section>}</main>;
}
