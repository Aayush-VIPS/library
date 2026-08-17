"use client";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import type { LibraryOption } from "@/lib/libraries";
import type { Role } from "@/lib/auth";

type UserRow = { id:string; email:string; name:string; role:Role; assignedLibraryIds:string[]; active:boolean; lastLoginAt:string };
const roles: { value: Role; label: string }[] = [
  { value: "SUPER_ADMIN", label: "Super Admin" },
  { value: "LIBRARY_MANAGER", label: "Library Manager" },
  { value: "STAFF", label: "Staff" },
  { value: "VIEWER", label: "Viewer" },
];

export function UserManager({ users, libraries }: { users: UserRow[]; libraries: LibraryOption[] }) {
  const router=useRouter();
  const [modal,setModal]=useState(false);
  const [editing,setEditing]=useState<UserRow|null>(null);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const [role,setRole]=useState<Role>("STAFF");

  function openNew(){setEditing(null);setRole("STAFF");setMessage("");setModal(true)}
  function openEdit(user:UserRow){setEditing(user);setRole(user.role);setMessage("");setModal(true)}

  async function save(e:FormEvent<HTMLFormElement>){
    e.preventDefault();setBusy(true);setMessage("");
    const fd=new FormData(e.currentTarget);
    const assignedLibraryIds=fd.getAll("assignedLibraryIds").map(String);
    const payload:any={email:fd.get("email"),name:fd.get("name"),role:fd.get("role"),assignedLibraryIds};
    const password=String(fd.get("password")||"");
    if(password)payload.password=password;
    const url=editing?`/api/admin/users/${editing.id}`:"/api/admin/users";
    const res=await fetch(url,{method:editing?"PATCH":"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload)});
    const body=await res.json().catch(()=>({message:"Request failed."}));
    setBusy(false);
    if(!res.ok){setMessage(body.message||"Could not save user.");return}
    setModal(false);router.refresh();
  }

  async function toggle(user:UserRow){
    setBusy(true);
    const res=await fetch(`/api/admin/users/${user.id}`,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({active:!user.active})});
    setBusy(false);
    if(!res.ok){const body=await res.json().catch(()=>({message:"Could not update user."}));alert(body.message||"Could not update user.");return}
    router.refresh();
  }

  return <>
    <div className="toolbar"><div className="toolbar-title"><b>{users.length} portal users</b><span>RBAC accounts for libraries and system administration</span></div><div className="toolbar-actions"><button className="btn primary" onClick={openNew}>Add user</button></div></div>
    <div className="table-scroll"><table><thead><tr><th>User</th><th>Role</th><th>Libraries</th><th>Last login</th><th>Status</th><th>Actions</th></tr></thead><tbody>{users.length?users.map((user)=><tr key={user.id}><td><b>{user.name}</b><div className="subtle">{user.email}</div></td><td>{roles.find((item)=>item.value===user.role)?.label||user.role}</td><td><span className="subtle">{user.role==="SUPER_ADMIN"?"All Libraries":user.assignedLibraryIds.map((id)=>libraries.find((library)=>library.id===id)?.name||id).join(", ")||"—"}</span></td><td>{user.lastLoginAt||"Never"}</td><td><span className={`badge ${user.active?"green":"gray"}`}>{user.active?"ACTIVE":"DISABLED"}</span></td><td><div className="toolbar-actions"><button className="btn" onClick={()=>openEdit(user)}>Edit</button><button className={`btn ${user.active?"danger":""}`} disabled={busy} onClick={()=>toggle(user)}>{user.active?"Disable":"Enable"}</button></div></td></tr>):<tr><td colSpan={6} className="empty">No users configured.</td></tr>}</tbody></table></div>
    {modal&&<div className="modal-backdrop" role="dialog" aria-modal="true"><form className="modal" onSubmit={save}><h3>{editing?"Edit user":"Add user"}</h3><p>Super admins can manage the system. Other roles are restricted to their assigned libraries.</p><div className="form-grid"><div className="field"><label>Name</label><input className="input" name="name" required defaultValue={editing?.name||""}/></div><div className="field"><label>Email</label><input className="input" name="email" type="email" required defaultValue={editing?.email||""}/></div><div className="field"><label>Role</label><select className="select" name="role" value={role} onChange={(e)=>setRole(e.target.value as Role)}>{roles.map((item)=><option key={item.value} value={item.value}>{item.label}</option>)}</select></div><div className="field"><label>{editing?"New password":"Password"}</label><input className="input" name="password" type="password" required={!editing} minLength={8}/></div>{role!=="SUPER_ADMIN"&&<div className="field full"><label>Assigned libraries</label><div className="check-grid">{libraries.map((library)=><label className="check-row" key={library.id}><input type="checkbox" name="assignedLibraryIds" value={library.id} defaultChecked={editing?.assignedLibraryIds.includes(library.id)}/><span>{library.name}</span></label>)}</div></div>}</div>{message&&<p className="error" style={{marginTop:10}}>{message}</p>}<div className="modal-actions"><button type="button" className="btn" onClick={()=>setModal(false)}>Cancel</button><button className="btn primary" disabled={busy}>{busy?"Saving...":"Save user"}</button></div></form></div>}
  </>;
}
