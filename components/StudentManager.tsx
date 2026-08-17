"use client";
import { FormEvent, useRef, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";

type StudentRow = { id:string; enrollmentNumber:string; name:string; rfidUid:string; course:string; batch:string; section:string; active:boolean };
const empty = { enrollmentNumber:"", name:"", rfidUid:"", course:"", batch:"", section:"" };

export function StudentManager({ students }: { students: StudentRow[] }) {
  const router=useRouter(); const fileRef=useRef<HTMLInputElement>(null);
  const [modal,setModal]=useState(false); const [editing,setEditing]=useState<StudentRow|null>(null); const [busy,setBusy]=useState(false); const [message,setMessage]=useState("");
  const openNew=()=>{setEditing(null);setMessage("");setModal(true)};
  const openEdit=(s:StudentRow)=>{setEditing(s);setMessage("");setModal(true)};

  async function save(e:FormEvent<HTMLFormElement>){
    e.preventDefault(); setBusy(true); setMessage("");
    const fd=new FormData(e.currentTarget); const payload=Object.fromEntries(fd.entries());
    const url=editing?`/api/admin/students/${editing.id}`:"/api/admin/students";
    const res=await fetch(url,{method:editing?"PATCH":"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload)});
    const body=await res.json().catch(()=>({message:"Request failed."})); setBusy(false);
    if(!res.ok){setMessage(body.message||"Could not save student.");return;} setModal(false); router.refresh();
  }
  async function toggle(s:StudentRow){
    setBusy(true); const res=await fetch(`/api/admin/students/${s.id}`,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({active:!s.active})}); setBusy(false);
    if(!res.ok){alert("Could not update student status.");return;} router.refresh();
  }
  async function importCsv(file:File){
    setBusy(true); setMessage(""); const text=await file.text(); const res=await fetch("/api/admin/students/import",{method:"POST",headers:{"content-type":"text/csv"},body:text}); const body=await res.json().catch(()=>({message:"Import failed."})); setBusy(false);
    if(!res.ok){setMessage(`${body.message||"Import failed."}${body.errors?.length?` ${body.errors.slice(0,3).join(" ")}`:""}`);return;} setMessage(`Imported ${body.imported} student records.`); router.refresh();
  }
  const values=editing||empty;
  return <>
    <div className="toolbar"><div className="toolbar-title"><b>{students.length} student records</b><span>Search is applied by the page query.</span></div><div className="toolbar-actions"><input ref={fileRef} hidden type="file" accept=".csv,text/csv" onChange={(e:ChangeEvent<HTMLInputElement>)=>{const f=e.target.files?.[0];if(f)importCsv(f)}}/><button className="btn" disabled={busy} onClick={()=>fileRef.current?.click()}>Import CSV</button><button className="btn primary" onClick={openNew}>Add student</button></div></div>
    {message && <div style={{padding:"10px 16px"}} className={message.startsWith("Imported")?"success":"error"}>{message}</div>}
    <div className="table-scroll"><table><thead><tr><th>Student</th><th>Enrollment</th><th>RFID UID</th><th>Batch</th><th>Status</th><th>Actions</th></tr></thead><tbody>{students.length?students.map(s=><tr key={s.id}><td><div className="person"><div className="avatar">{s.name.split(/\s+/).slice(0,2).map(x=>x[0]).join("")}</div><div><b>{s.name}</b><div className="subtle">{s.course}{s.section?` · ${s.section}`:""}</div></div></div></td><td>{s.enrollmentNumber}</td><td>{s.rfidUid}</td><td>{s.batch||"—"}</td><td><span className={`badge ${s.active?"green":"gray"}`}>{s.active?"ACTIVE":"DISABLED"}</span></td><td><div className="toolbar-actions"><button className="btn" onClick={()=>openEdit(s)}>Edit</button><button className={`btn ${s.active?"danger":""}`} disabled={busy} onClick={()=>toggle(s)}>{s.active?"Disable":"Enable"}</button></div></td></tr>):<tr><td colSpan={6} className="empty">No matching students.</td></tr>}</tbody></table></div>
    {modal&&<div className="modal-backdrop" role="dialog" aria-modal="true"><form className="modal" onSubmit={save}><h3>{editing?"Edit student":"Add student"}</h3><p>RFID UID must be unique and should match the decimal value produced by the reader firmware.</p><div className="form-grid"><div className="field"><label>Enrollment number</label><input className="input" name="enrollmentNumber" defaultValue={values.enrollmentNumber} required/></div><div className="field"><label>RFID UID</label><input className="input" name="rfidUid" inputMode="numeric" pattern="[0-9]+" defaultValue={values.rfidUid} required/></div><div className="field full"><label>Student name</label><input className="input" name="name" defaultValue={values.name} required/></div><div className="field"><label>Course</label><input className="input" name="course" defaultValue={values.course}/></div><div className="field"><label>Batch</label><input className="input" name="batch" defaultValue={values.batch}/></div><div className="field"><label>Section</label><input className="input" name="section" defaultValue={values.section}/></div></div>{message&&<p className="error" style={{marginTop:10}}>{message}</p>}<div className="modal-actions"><button type="button" className="btn" onClick={()=>setModal(false)}>Cancel</button><button className="btn primary" disabled={busy}>{busy?"Saving…":"Save student"}</button></div></form></div>}
  </>;
}
