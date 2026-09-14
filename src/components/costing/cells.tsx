"use client"

import { Fragment, useEffect, useId, useState } from "react"
import { createClient } from "@/lib/supabase/client"

// Shared inline-edit cells for the costing tables. Uncontrolled + keyed to the
// committed value: typing stays local; a commit (or external change) updates the
// prop -> key changes -> input re-seeds. Enter commits (blur); native Tab moves on.

const cls = "w-full rounded border border-transparent hover:border-input focus:border-input bg-transparent px-1.5 py-1 text-sm outline-none"

let sharedSupplierCache: string[] | null = null
let sharedSupplierRequest: Promise<string[]> | null = null

function loadSharedSuppliers() {
    if (sharedSupplierCache) return Promise.resolve(sharedSupplierCache)
    if (!sharedSupplierRequest) {
        const supabase = createClient()
        sharedSupplierRequest = supabase.from("costing_suppliers").select("name").order("name")
            .then(({ data, error }) => {
                if (error) return []
                sharedSupplierCache = ((data as { name: string }[]) || []).map((row) => row.name).filter(Boolean)
                return sharedSupplierCache
            })
            .finally(() => { sharedSupplierRequest = null })
    }
    return sharedSupplierRequest
}

export function NumCell({ value, onCommit, step, placeholder, align = "right", decimals }: {
    value: number | null
    onCommit: (v: number | null) => void
    step?: string
    placeholder?: string
    align?: "right" | "left"
    decimals?: number
}) {
    const committed = value == null ? "" : (decimals != null ? Number(value).toFixed(decimals) : String(value))
    return (
        <input
            key={committed}
            type="number" step={step ?? "any"} defaultValue={committed} placeholder={placeholder}
            onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur() }}
            onBlur={(e) => {
                const raw = e.target.value
                const n = raw.trim() === "" ? null : Number(raw)
                if (n != null && isNaN(n)) { e.target.value = committed; return }
                if (n !== value) onCommit(n)
                else if (decimals != null && n != null) e.target.value = n.toFixed(decimals)
            }}
            // Hide the number spinner — in Chrome it overlaps right-aligned text and clips the last digit.
            className={`${cls} tabular-nums [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${align === "right" ? "text-right" : ""}`}
        />
    )
}

export function TextCell({ value, onCommit, placeholder }: {
    value: string
    onCommit: (v: string) => void
    placeholder?: string
}) {
    return (
        <input
            key={value}
            type="text" defaultValue={value} placeholder={placeholder}
            onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur() }}
            onBlur={(e) => { if (e.target.value !== value) onCommit(e.target.value) }}
            className={cls}
        />
    )
}

// Supplier cell: free text + autocomplete from the shared costing supplier list.
// listId remains as a fallback for pages that already provide their own datalist.
export function SupplierCell({ value, onCommit, listId, placeholder }: {
    value: string
    onCommit: (v: string) => void
    listId: string
    placeholder?: string
}) {
    const generatedId = useId().replace(/:/g, "")
    const ownListId = `supplier-options-${generatedId}`
    const [options, setOptions] = useState<string[]>(sharedSupplierCache ?? [])

    useEffect(() => {
        let active = true
        void loadSharedSuppliers().then((names) => { if (active && names.length) setOptions(names) })
        return () => { active = false }
    }, [])

    return (
        <Fragment>
            <input
                key={value}
                type="text" defaultValue={value} placeholder={placeholder} list={options.length ? ownListId : listId}
                onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur() }}
                onBlur={(e) => { if (e.target.value !== value) onCommit(e.target.value) }}
                className={cls}
            />
            {options.length > 0 && (
                <datalist id={ownListId}>
                    {options.map((name) => <option key={name} value={name} />)}
                </datalist>
            )}
        </Fragment>
    )
}

export function DateCell({ value, onCommit }: {
    value: string | null
    onCommit: (v: string | null) => void
}) {
    const committed = value ?? ""
    return (
        <input
            key={committed}
            type="date" defaultValue={committed}
            onBlur={(e) => { if (e.target.value !== committed) onCommit(e.target.value || null) }}
            className={`${cls} tabular-nums`}
        />
    )
}
