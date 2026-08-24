"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Search } from "lucide-react"
import { applyMaterialSearch } from "@/lib/costing/material-search"
import type { Material } from "@/types/database"

const nz = (n: number) => n.toLocaleString("en-NZ", { style: "currency", currency: "NZD" })
const RESULT_LIMIT = 40

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
    const [capped, setCapped] = useState(false)
    const [active, setActive] = useState(0)

    const inputRef = useRef<HTMLInputElement | null>(null)
    const listRef = useRef<HTMLUListElement | null>(null)
    const [dropUp, setDropUp] = useState(false)

    // Keep the keyboard-highlighted row scrolled into view.
    useEffect(() => {
        const el = listRef.current?.children[active] as HTMLElement | undefined
        el?.scrollIntoView({ block: "nearest" })
    }, [active])

    // Open upward when the input sits low in the viewport (long BOMs push it down).
    function decideDirection() {
        const r = inputRef.current?.getBoundingClientRect()
        if (!r) return
        const below = window.innerHeight - r.bottom
        setDropUp(below < 340 && r.top > below)
    }

    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    function search(text: string) {
        if (timerRef.current) clearTimeout(timerRef.current)
        if (!text.trim()) { setResults([]); setOpen(false); return }
        timerRef.current = setTimeout(async () => {
            const query = supabase.from("materials").select("*").eq("active", true)
            const { data } = await applyMaterialSearch(query, text).order("description").limit(RESULT_LIMIT)
            const rows = (data as Material[]) || []
            setResults(rows)
            setCapped(rows.length === RESULT_LIMIT)
            setActive(0)
            decideDirection()
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
                ref={inputRef}
                autoFocus={autoFocus}
                type="text" value={q} placeholder={placeholder}
                onChange={(e) => { setQ(e.target.value); search(e.target.value) }}
                onFocus={() => { if (results.length) { decideDirection(); setOpen(true) } }}
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
                <div className={`absolute z-30 left-0 right-0 rounded-md border border-border bg-popover shadow-md text-sm ${dropUp ? "bottom-full mb-1" : "top-full mt-1"}`}>
                    <ul ref={listRef} className="max-h-80 overflow-y-auto overscroll-contain">
                        {results.map((m, i) => (
                            <li key={m.id}>
                                <button type="button"
                                    onMouseDown={(e) => { e.preventDefault(); pick(m) }}
                                    onMouseEnter={() => setActive(i)}
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
                    {capped && (
                        <div className="px-2.5 py-1.5 text-xs text-muted-foreground border-t border-border/60 bg-muted/30">
                            Showing first {RESULT_LIMIT} — keep typing to narrow (e.g. add a size or code).
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
