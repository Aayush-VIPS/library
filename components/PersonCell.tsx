export function PersonCell({ name, sub }: { name: string; sub?: string }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]?.toUpperCase()).join("");
  return <div className="person"><div className="avatar">{initials}</div><div><b>{name}</b>{sub ? <div className="subtle">{sub}</div> : null}</div></div>;
}
