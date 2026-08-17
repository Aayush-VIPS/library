export function FootfallChart({ data }: { data: { hour:number; count:number }[] }) {
  const max = Math.max(1,...data.map(x=>x.count));
  return <div className="chart">{data.map(x=><div className="chart-slot" key={x.hour}><span className="chart-value">{x.count || ""}</span><div className="chart-bar" style={{height:`${Math.max(3,(x.count/max)*100)}%`}}/><span className="chart-label">{String(x.hour).padStart(2,"0")}:00</span></div>)}</div>;
}
