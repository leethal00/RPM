"use client"

import * as React from "react"
import { clampSidebarWidth, MAX_SIDEBAR_WIDTH, MIN_SIDEBAR_WIDTH } from "@/components/sidebar-width"

const RESIZE_MEDIA_QUERY = "(min-width: 1024px) and (hover: hover) and (pointer: fine)"

export function SidebarResizeHandle({ width, onResize, onResizeStart, onResizeEnd }: {
    width: number
    onResize: (width: number) => void
    onResizeStart: () => void
    onResizeEnd: (width: number) => void
}) {
    const dragging = React.useRef(false)
    const latestWidth = React.useRef(width)

    const finishResize = () => {
        if (!dragging.current) return
        dragging.current = false
        onResizeEnd(latestWidth.current)
    }

    return (
        <div
            role="separator"
            aria-label="Resize navigation sidebar"
            aria-orientation="vertical"
            aria-valuemin={MIN_SIDEBAR_WIDTH}
            aria-valuemax={MAX_SIDEBAR_WIDTH}
            aria-valuenow={width}
            title="Drag to resize navigation; use arrow keys for smaller steps"
            tabIndex={0}
            className="rpm-sidebar-resize-handle group-data-[collapsible=icon]:hidden"
            onPointerDown={(event) => {
                if (event.button !== 0 || !window.matchMedia(RESIZE_MEDIA_QUERY).matches) return
                dragging.current = true
                latestWidth.current = width
                event.currentTarget.setPointerCapture(event.pointerId)
                onResizeStart()
                event.preventDefault()
            }}
            onPointerMove={(event) => {
                if (!dragging.current) return
                const nextWidth = clampSidebarWidth(event.clientX)
                latestWidth.current = nextWidth
                onResize(nextWidth)
            }}
            onPointerUp={(event) => {
                if (!dragging.current) return
                const nextWidth = clampSidebarWidth(event.clientX)
                latestWidth.current = nextWidth
                onResize(nextWidth)
                event.currentTarget.releasePointerCapture(event.pointerId)
                finishResize()
            }}
            onPointerCancel={finishResize}
            onLostPointerCapture={finishResize}
            onKeyDown={(event) => {
                if (!window.matchMedia(RESIZE_MEDIA_QUERY).matches) return
                if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return
                event.preventDefault()
                const nextWidth = clampSidebarWidth(width + (event.key === "ArrowRight" ? 16 : -16))
                onResize(nextWidth)
                onResizeEnd(nextWidth)
            }}
        />
    )
}
