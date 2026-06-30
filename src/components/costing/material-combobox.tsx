"use client"

import { useMemo, useRef, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Search } from "lucide-react"
import type { Material } from "@/types/database"

const nz = (n: number) => n.toLocaleString("en-NZ", { style: "currency", currency: "NZD" })

/**
 * Inline type-ahead over the materials catalogue.
 * - "add" use (clearOnSelect): top-of-BOM "add item" box — onSelect adds a line, input clears.
 * - "edit" use: a line's Description — onSelect fills the line; onTextCommit keeps free text.
 *   Parent should pass key={committedValue} so it re-seeds when the value changes externally.
 */
export function MaterialCombobox({
    value = "", placeholder, onSelect, onTextCommit, clearOnSelect = false, className = "", autoFocus = false,
}: {
    value?: string
    placeholder?: string
    onSelect: (m: Material) => void
    onTextCommit?: (text: string) => void
    clearOnSelect?: boolean
    className?: string
    autoFocus?: boolean
}) {
    const supabase = useMemo(() => createClient(), [])
    const [q, setQ] = useState(value)
    const [open, setOpen] = useState(false)
    const [results, setResults] = useState<Material[]>([])
    const [active, setActive] = useState(0)

    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    function search(text: string) {
        if (timerRef.current) clearTimeout(timerRef.current)
        if (!text.trim()) { setResults([]); setOpen(false); return }
        timerRef.current = setTimeout(async () => {
            const { data } = await supabase.from("materials").select("*").eq("active", true)
                .or(`description.ilike.%${text}%,code.ilike.%${text}%`).order("description").limit(8)
            setResults((data as Material[]) || [])
            setActive(0)
            setOpen(true)
        }, 160)
    }

    function pick(m: Material) {
        onSelect(m)
        setOpen(false)
        setQ(clearOnSelect ? "" : m.description)
    }

    return (
        <div className="relative">
            <input
                autoFocus={autoFocus}
                type="text" value={q} placeholder={placeholder}
                onChange={(e) => { setQ(e.target.value); search(e.target.value) }}
                onFocus={() => { if (results.length) setOpen(true) }}
                onBlur={() => { setTimeout(() => setOpen(false), 120); if (onTextCommit && q !== value) onTextCommit(q) }}
                onKeyDown={(e) => {
                    if (!open) { if (e.key === "Enter" && onTextCommit) e.currentTarget.blur(); return }
                    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)) }
                    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)) }
                    else if (e.key === "Enter") { e.preventDefault(); if (results[active]) pick(results[active]) }
                    else if (e.key === "Escape") setOpen(false)
                }}
                className={className || "w-full rounded border border-transparent hover:border-input focus:border-input bg-transparent px-1.5 py-1 text-sm outline-none"}
            />
            {open && results.length > 0 && (
                <ul className="absolute z-30 left-0 right-0 mt-1 max-h-72 overflow-y-auto rounded-md border border-border bg-popover shadow-md text-sm">
                    {results.map((m, i) => (
                        <li key={m.id}>
                            <button type="button"
                                onMouseDown={(e) => { e.preventDefault(); pick(m) }}
                                className={`w-full text-left px-2.5 py-1.5 flex items-center gap-2 ${i === active ? "bg-muted" : "hover:bg-muted/60"}`}>
                                <Search className="size-3 text-muted-foreground shrink-0" />
                                <span className="min-w-0 flex-1 truncate">{m.description}</span>
                                <span className="text-xs text-muted-foreground shrink-0 tabular-nums">
                                    {[m.subsection || m.section, m.supplier].filter(Boolean).join(" · ")} · {nz(m.unit_cost)}
                                </span>
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    )
}
