"use client"

import { useCallback, useEffect, useRef, useState } from "react"

export interface ColumnLayout {
    order: string[]
    widths: Record<string, number>
}

/**
 * Persisted, user-adjustable column order + widths for a table.
 * Order is drag-reordered; widths are drag-resized. Both survive reloads via
 * localStorage. New columns added to `defaults` later are appended for existing
 * users; removed columns are dropped.
 *
 * `defaults` is expected to be a stable (module-constant) value.
 */
export function useColumnLayout(storageKey: string, defaults: ColumnLayout) {
    const [order, setOrder] = useState<string[]>(() => defaults.order)
    const [widths, setWidths] = useState<Record<string, number>>(() => defaults.widths)
    const loaded = useRef(false)

    // Load saved layout, reconciled against current defaults. Deferred a microtask
    // so the first (SSR-matching) render uses defaults, then applies the saved layout.
    useEffect(() => {
        let active = true
        ;(async () => {
            await Promise.resolve()
            if (!active) return
            try {
                const raw = localStorage.getItem(storageKey)
                if (raw) {
                    const saved = JSON.parse(raw) as Partial<ColumnLayout>
                    const known = new Set(defaults.order)
                    const savedOrder = (saved.order ?? []).filter((k) => known.has(k))
                    const merged = [...savedOrder, ...defaults.order.filter((k) => !savedOrder.includes(k))]
                    setOrder(merged)
                    setWidths({ ...defaults.widths, ...(saved.widths ?? {}) })
                }
            } catch {
                /* ignore malformed storage */
            }
            loaded.current = true
        })()
        return () => { active = false }
    }, [storageKey, defaults])

    // Persist after the initial load.
    useEffect(() => {
        if (!loaded.current) return
        try {
            localStorage.setItem(storageKey, JSON.stringify({ order, widths }))
        } catch {
            /* storage full / unavailable — non-fatal */
        }
    }, [order, widths, storageKey])

    // Move column `from` to sit before column `to`.
    const move = useCallback((from: string, to: string) => {
        setOrder((prev) => {
            if (from === to) return prev
            const next = prev.filter((k) => k !== from)
            const idx = next.indexOf(to)
            if (idx < 0) return prev
            next.splice(idx, 0, from)
            return next
        })
    }, [])

    const setWidth = useCallback((key: string, w: number) => {
        setWidths((prev) => ({ ...prev, [key]: w }))
    }, [])

    const reset = useCallback(() => {
        setOrder(defaults.order)
        setWidths(defaults.widths)
    }, [defaults])

    return { order, widths, move, setWidth, reset }
}
