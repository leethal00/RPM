import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Plus, Trash2 } from 'lucide-react'
import type { ScanLabour, ScanReview } from '@/lib/scan-review'

export function ScanReviewEntries({ review, onChange, editable }: { review: ScanReview; onChange: (review: ScanReview) => void; editable: boolean }) {
  function timeRow(section: 'labour' | 'travel', index: number, patch: Partial<ScanLabour>) {
    onChange({ ...review, [section]: review[section].map((row, position) => position === index ? { ...row, ...patch } : row) })
  }
  return <>
    <p className="text-sm text-muted-foreground">Enter each day and employee as a separate row. Check all entries against the original card before posting.</p>
    {(['labour', 'travel'] as const).map(section => {
      const label = section === 'labour' ? 'Labour' : 'Travel'
      return <div className="space-y-3" key={section}>
        <div className="flex items-center justify-between"><h2 className="font-semibold">{label}</h2>{editable && <Button size="sm" variant="outline" onClick={() => onChange({ ...review, [section]: [...review[section], { employee: review[section].at(-1)?.employee || '', date: '', hours: '', type: section === 'travel' ? 'Travel' : 'Workshop', description: '' }] })}><Plus/>Add {section}</Button>}</div>
        {review[section].map((row, index) => <div key={index} className="space-y-3 rounded-md border p-3">
          <div className="flex items-center justify-between"><h3 className="text-sm font-medium">{label} entry {index + 1}</h3>{editable && <Button variant="ghost" size="icon" aria-label={`Remove ${section} ${index + 1}`} onClick={() => onChange({ ...review, [section]: review[section].filter((_, position) => position !== index) })}><Trash2/></Button>}</div>
          <div className="grid gap-3 sm:grid-cols-2"><div><Label htmlFor={`${section}-date-${index}`}>Work date</Label><Input id={`${section}-date-${index}`} type="date" value={row.date} disabled={!editable} onChange={e => timeRow(section, index, { date: e.target.value })}/></div>
            <div><Label htmlFor={`${section}-employee-${index}`}>Employee</Label><Input id={`${section}-employee-${index}`} value={row.employee} disabled={!editable} onChange={e => timeRow(section, index, { employee: e.target.value })}/></div>
            <div><Label htmlFor={`${section}-hours-${index}`}>Hours</Label><Input id={`${section}-hours-${index}`} type="number" min="0" step="any" value={row.hours} disabled={!editable} onChange={e => timeRow(section, index, { hours: e.target.value })}/></div>
            {section === 'labour' && <div><Label htmlFor={`labour-type-${index}`}>Labour type / department</Label><Input id={`labour-type-${index}`} value={row.type} disabled={!editable} onChange={e => timeRow(section, index, { type: e.target.value })}/></div>}
          </div>
          <div><Label htmlFor={`${section}-description-${index}`}>{section === 'labour' ? 'Work done' : 'Travel notes'}</Label><Input id={`${section}-description-${index}`} value={row.description} disabled={!editable} onChange={e => timeRow(section, index, { description: e.target.value })}/></div>
        </div>)}
      </div>
    })}
    <div className="space-y-3"><div className="flex items-center justify-between"><h2 className="font-semibold">Materials</h2>{editable && <Button size="sm" variant="outline" onClick={() => onChange({ ...review, materials: [...review.materials, { date: '', description: '', qty: '', unit: '', cost: '' }] })}><Plus/>Add material</Button>}</div>
      {review.materials.map((row, index) => <div key={index} className="space-y-3 rounded-md border p-3">
        <div className="flex items-center justify-between"><h3 className="text-sm font-medium">Material entry {index + 1}</h3>{editable && <Button variant="ghost" size="icon" aria-label={`Remove material ${index + 1}`} onClick={() => onChange({ ...review, materials: review.materials.filter((_, position) => position !== index) })}><Trash2/></Button>}</div>
        <div className="grid gap-3 sm:grid-cols-2">{(['date', 'description', 'qty', 'unit', 'cost'] as const).map(key => <div key={key}><Label htmlFor={`material-${key}-${index}`}>{{ date: 'Date used', description: 'Description', qty: 'Quantity', unit: 'Unit', cost: 'Cost (optional)' }[key]}</Label><Input id={`material-${key}-${index}`} type={key === 'date' ? 'date' : key === 'qty' || key === 'cost' ? 'number' : 'text'} step="any" min={key === 'qty' || key === 'cost' ? '0' : undefined} value={row[key]} disabled={!editable} onChange={e => onChange({ ...review, materials: review.materials.map((entry, position) => position === index ? { ...entry, [key]: e.target.value } : entry) })}/></div>)}</div>
      </div>)}
    </div>
  </>
}
