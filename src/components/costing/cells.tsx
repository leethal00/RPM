"use client"

// Shared inline-edit cells for the costing tables. Uncontrolled + keyed to the
// committed value: typing stays local; a commit (or external change) updates the
// prop -> key changes -> input re-seeds. Enter commits (blur); native Tab moves on.

const cls = "w-full rounded border border-transparent hover:border-input focus:border-input bg-transparent px-1.5 py-1 text-sm outline-none"

export function NumCell({ value, onCommit, step, placeholder, align = "right" }: {
    value: number | null
    onCommit: (v: number | null) => void
    step?: string
    placeholder?: string
    align?: "right" | "left"
}) {
    const committed = value == null ? "" : String(value)
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

// Supplier cell: free text + autocomplete from a shared <datalist> (see listId).
export function SupplierCell({ value, onCommit, listId, placeholder }: {
    value: string
    onCommit: (v: string) => void
    listId: string
    placeholder?: string
}) {
    return (
        <input
            key={value}
            type="text" defaultValue={value} placeholder={placeholder} list={listId}
            onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur() }}
            onBlur={(e) => { if (e.target.value !== value) onCommit(e.target.value) }}
            className={cls}
        />
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
