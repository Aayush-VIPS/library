"use client";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type LibraryRow = { id:string; libraryId:string; name:string; location:string; active:boolean };

export function LibraryManager({ libraries }: { libraries: LibraryRow[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<LibraryRow | null>(null);
  const [modal, setModal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  function openNew(){setEditing(null);setMessage("");setModal(true)}
  function openEdit(library:LibraryRow){setEditing(library);setMessage("");setModal(true)}

  async function save(e:FormEvent<HTMLFormElement>){
    e.preventDefault();setBusy(true);setMessage("");
    const fd=new FormData(e.currentTarget);
    const payload=Object.fromEntries(fd.entries());
    const url=editing?`/api/admin/libraries/${editing.id}`:"/api/admin/libraries";
    const res=await fetch(url,{method:editing?"PATCH":"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload)});
    const body=await res.json().catch(()=>({message:"Request failed."}));
    setBusy(false);
    if(!res.ok){setMessage(body.message||"Could not save library.");return}
    setModal(false);router.refresh();
  }

  async function toggle(library:LibraryRow){
    setBusy(true);
    const res=await fetch(`/api/admin/libraries/${library.id}`,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({active:!library.active})});
    setBusy(false);
    if(!res.ok){alert("Could not update library.");return}
    router.refresh();
  }

  return <>
    <div className="toolbar"><div className="toolbar-title"><b>{libraries.length} libraries</b><span>Branches available for reader assignment and RBAC scopes</span></div><div className="toolbar-actions"><button className="btn primary" onClick={openNew}>Add library</button></div></div>
    <div className="table-scroll"><table><thead><tr><th>Library</th><th>ID</th><th>Location</th><th>Status</th><th>Actions</th></tr></thead><tbody>{libraries.length?libraries.map((library)=><tr key={library.id}><td><b>{library.name}</b></td><td>{library.libraryId}</td><td>{library.location||"—"}</td><td><span className={`badge ${library.active?"green":"gray"}`}>{library.active?"ACTIVE":"DISABLED"}</span></td><td><div className="toolbar-actions"><button className="btn" onClick={()=>openEdit(library)}>Edit</button><button className={`btn ${library.active?"danger":""}`} disabled={busy} onClick={()=>toggle(library)}>{library.active?"Disable":"Enable"}</button></div></td></tr>):<tr><td colSpan={5} className="empty">No libraries configured.</td></tr>}</tbody></table></div>
    {modal&&<div className="modal-backdrop" role="dialog" aria-modal="true"><form className="modal" onSubmit={save}><h3>{editing?"Edit library":"Add library"}</h3><p>Library ID is used in device assignments and access scopes. It is generated from the name unless specified.</p><div className="form-grid">{!editing&&<div className="field"><label>Library ID</label><input className="input" name="libraryId" placeholder="central-library"/></div>}<div className="field"><label>Name</label><input className="input" name="name" required defaultValue={editing?.name||""}/></div><div className="field full"><label>Location</label><input className="input" name="location" defaultValue={editing?.location||""}/></div></div>{message&&<p className="error" style={{marginTop:10}}>{message}</p>}<div className="modal-actions"><button type="button" className="btn" onClick={()=>setModal(false)}>Cancel</button><button className="btn primary" disabled={busy}>{busy?"Saving...":"Save library"}</button></div></form></div>}
  </>;
}
