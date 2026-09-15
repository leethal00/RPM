"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { createClient } from "@/lib/supabase/client"
import { Search } from "lucide-react"
import { applyMaterialSearch } from "@/lib/costing/material-search"
import type { Material } from "@/types/database"

const nz = (n: number) => n.toLocaleString("en-NZ", { style: "currency", currency: "NZD" })
const RESULT_LIMIT = 40

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
    const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({})

    const inputRef = useRef<HTMLInputElement | null>(null)
    const listRef = useRef<HTMLUListElement | null>(null)

    useEffect(() => {
        const el = listRef.current?.children[active] as HTMLElement | undefined
        el?.scrollIntoView({ block: "nearest" })
    }, [active])

    function positionMenu() {
        const r = inputRef.current?.getBoundingClientRect()
        if (!r) return
        const width = Math.max(r.width, Math.min(820, window.innerWidth - r.left - 24))
        setMenuStyle({
            position: "fixed",
            left: r.left,
            top: r.bottom + 4,
            width,
            zIndex: 9999,
        })
    }

    useEffect(() => {
        if (!open) return
        positionMenu()
        const handler = () => positionMenu()
        window.addEventListener("resize", handler)
        window.addEventListener("scroll", handler, true)
        return () => {
            window.removeEventListener("resize", handler)
            window.removeEventListener("scroll", handler, true)
        }
    }, [open])

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
            positionMenu()
            setOpen(true)
        }, 160)
    }

    function pick(m: Material) {
        onSelect(m)
        setOpen(false)
        setQ(clearOnSelect ? "" : m.description)
    }

    const dropdown = open && results.length > 0 && typeof document !== "undefined" ? createPortal(
        <div style={menuStyle} className="rounded-md border border-border bg-popover shadow-xl text-sm overflow-hidden">
            <ul ref={listRef} className="max-h-[17rem] overflow-y-auto overscroll-contain">
                {results.map((m, i) => (
                    <li key={m.id}>
                        <button type="button"
                            onMouseDown={(e) => { e.preventDefault(); pick(m) }}
                            onMouseEnter={() => setActive(i)}
                            className={`w-full text-left px-2.5 py-1.5 flex items-center gap-3 ${i === active ? "bg-muted" : "hover:bg-muted/60"}`}>
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
        </div>,
        document.body
    ) : null

    return (
        <div className="relative">
            <input
                ref={inputRef}
                autoFocus={autoFocus}
                type="text" value={q} placeholder={placeholder}
                onChange={(e) => { setQ(e.target.value); search(e.target.value) }}
                onFocus={() => { if (results.length) { positionMenu(); setOpen(true) } }}
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
            {dropdown}
        </div>
    )
}
