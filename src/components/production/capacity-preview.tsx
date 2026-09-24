const days = [
 { day: 'Mon 28', hours: 7, jobs: [{ name: '26418 · Gateway Plinths', task: 'Preparation', hours: 4 }, { name: '26424 · Fascia panels', task: 'Production', hours: 3 }] },
 { day: 'Tue 29', hours: 8, jobs: [{ name: '26418 · Gateway Plinths', task: 'Production', hours: 6 }, { name: '26427 · ACM panels', task: 'Preparation', hours: 2 }] },
 { day: 'Wed 30', hours: 6, jobs: [{ name: '26424 · Fascia panels', task: 'Production', hours: 6 }] },
 { day: 'Thu 1', hours: 10, jobs: [{ name: '26418 · Gateway Plinths', task: 'Production', hours: 6 }, { name: '26427 · ACM panels', task: 'Production', hours: 4 }] },
 { day: 'Fri 2', hours: 3, jobs: [{ name: '26418 · Gateway Plinths', task: 'Final checks', hours: 3 }] },
]
export function CapacityPreview({ department }: { department: string }) {
 return <section className="mt-4 space-y-5 rounded-xl border bg-card p-5" aria-label="Example capacity and schedule">
  <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-semibold">Capacity & schedule</h2><p className="mt-1 text-sm text-muted-foreground">{department} · Week of 28 September – 2 October 2026</p></div><span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-900">Example only · Not active</span></div>
  <p className="text-xs text-muted-foreground">Illustrative hours and bookings. This example does not use the jobs above.</p>
  <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
   <div className="rounded-lg border p-4"><h3 className="font-medium">Weekly capacity</h3><div className="mt-3 flex items-baseline gap-1"><strong className="text-3xl">34</strong><span className="text-sm text-muted-foreground">/ 40 h allocated</span></div><p className="mt-1 text-xs text-muted-foreground">Example capacity: 8 hours per day</p>
    <div className="mt-5 space-y-4">{days.map(day => <div key={day.day}><div className="mb-1 flex justify-between text-xs"><span>{day.day}</span><span className={day.hours > 8 ? 'font-medium text-amber-700' : ''}>{day.hours} / 8 h{day.hours > 8 ? ' · 2 h over' : ''}</span></div><div className="h-2 rounded-full bg-muted"><div className={day.hours > 8 ? 'h-2 rounded-full bg-amber-500' : 'h-2 rounded-full bg-emerald-700'} style={{width: `${Math.min(day.hours/8,1)*100}%`}} /></div></div>)}</div>
    <p className="mt-5 rounded-md bg-amber-50 p-2 text-xs text-amber-900">Thursday exceeds daily capacity by 2 h.</p>
   </div>
   <div className="min-w-0"><h3 className="mb-3 font-medium">Weekly schedule</h3><div className="overflow-x-auto"><div className="grid min-w-[620px] grid-cols-5 rounded-lg border">{days.map(day => <div key={day.day} className="min-h-64 border-r last:border-r-0"><div className="border-b bg-muted/40 p-3"><div className="text-sm font-medium">{day.day}</div><div className="mt-1 text-xs text-muted-foreground">{day.hours} h planned</div></div><div className="space-y-2 p-2">{day.jobs.map((job,i) => <div key={job.name} className={i % 2 ? 'rounded-md border border-sky-200 bg-sky-50 p-2 text-sky-950' : 'rounded-md border border-emerald-200 bg-emerald-50 p-2 text-emerald-950'}><div className="text-xs font-medium leading-5">{job.name}</div><div className="mt-2 text-xs opacity-75">{job.task} · {job.hours} h</div></div>)}{day.hours < 8 && <div className="rounded-md border border-dashed p-2 text-xs text-muted-foreground">{8-day.hours} h available</div>}</div></div>)}</div></div><p className="mt-3 text-xs text-muted-foreground">A future view of planned work by day. Scheduling controls will come later.</p></div>
  </div>
 </section>
}
