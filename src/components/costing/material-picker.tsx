"use client"

import { useEffect, useMemo, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Search, Loader2 } from "lucide-react"
import type { Material } from "@/types/database"

interface MaterialPickerProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    onPick: (material: Material) => void
    /** Optional: bias the initial search to a section */
    section?: string
}

const nz = (n: number) => n.toLocaleString("en-NZ", { style: "currency", currency: "NZD" })

export function MaterialPicker({ open, onOpenChange, onPick, section }: MaterialPickerProps) {
    const supabase = useMemo(() => createClient(), [])
    const [q, setQ] = useState("")
    const [results, setResults] = useState<Material[]>([])
    const [loading, setLoading] = useState(false)

    useEffect(() => {
        if (!open) return
        let active = true
        const t = setTimeout(async () => {
            setLoading(true)
            let query = supabase
                .from("materials")
                .select("*")
                .eq("active", true)
                .order("section")
                .order("description")
                .limit(50)
            if (q.trim()) query = query.or(`description.ilike.%${q}%,code.ilike.%${q}%`)
            else if (section) query = query.eq("section", section)
            const { data } = await query
            if (active) {
                setResults((data as Material[]) || [])
                setLoading(false)
            }
        }, 180)
        return () => { active = false; clearTimeout(t) }
    }, [q, open, section, supabase])

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[640px] p-0 gap-0">
                <DialogHeader className="px-4 pt-4">
                    <DialogTitle>Add from catalogue</DialogTitle>
                    <DialogDescription className="sr-only">Search materials by code or description</DialogDescription>
                </DialogHeader>
                <div className="px-4 py-3 border-b">
                    <div className="relative">
                        <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
                        <Input
                            autoFocus
                            placeholder="Search by description or code…"
                            value={q}
                            onChange={(e) => setQ(e.target.value)}
                            className="pl-8"
                        />
                    </div>
                </div>
                <div className="max-h-[420px] overflow-y-auto">
                    {loading ? (
                        <div className="flex items-center justify-center py-10 text-muted-foreground">
                            <Loader2 className="size-4 animate-spin" />
                        </div>
                    ) : results.length === 0 ? (
                        <div className="py-10 text-center text-sm text-muted-foreground">No matches.</div>
                    ) : (
                        <ul className="divide-y divide-border/60">
                            {results.map((m) => (
                                <li key={m.id}>
                                    <button
                                        type="button"
                                        onClick={() => { onPick(m); onOpenChange(false) }}
                                        className="w-full text-left px-4 py-2.5 hover:bg-muted/40 transition-colors flex items-center gap-3"
                                    >
                                        <div className="min-w-0 flex-1">
                                            <div className="text-sm text-foreground truncate">{m.description}</div>
                                            <div className="text-xs text-muted-foreground truncate">
                                                {[m.code, m.subsection || m.section, m.supplier].filter(Boolean).join(" · ")}
                                            </div>
                                        </div>
                                        <div className="text-xs tabular-nums text-muted-foreground shrink-0 text-right">
                                            <div>{nz(m.unit_cost)}</div>
                                            <div>+{Math.round(m.default_markup * 100)}%</div>
                                        </div>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    )
}
