import * as React from "react"
import { fireEvent, render, renderHook, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { SidebarResizeHandle } from "@/components/sidebar-resize-handle"
import { clampSidebarWidth } from "@/components/sidebar-width"
import { useIsMobile } from "@/hooks/use-mobile"

function setViewport(width: number, finePointer = true) {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: width })
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
        matches: query.includes("pointer: fine") ? width >= 1024 && finePointer : width < 1024,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
    }))
}

afterEach(() => vi.restoreAllMocks())

describe("navigation sidebar breakpoints", () => {
    it.each([390, 900])("uses the drawer at %ipx", async (width) => {
        setViewport(width)
        const { result } = renderHook(() => useIsMobile())
        await waitFor(() => expect(result.current).toBe(true))
    })

    it("uses the fixed sidebar at desktop width", async () => {
        setViewport(1280)
        const { result } = renderHook(() => useIsMobile())
        await waitFor(() => expect(result.current).toBe(false))
    })
})

describe("desktop navigation resize", () => {
    it("clamps widths to a usable range", () => {
        expect(clampSidebarWidth(120)).toBe(200)
        expect(clampSidebarWidth(320)).toBe(320)
        expect(clampSidebarWidth(600)).toBe(400)
    })

    it("resizes with a desktop pointer and saves the final width", () => {
        setViewport(1280)
        HTMLElement.prototype.setPointerCapture = vi.fn()
        HTMLElement.prototype.releasePointerCapture = vi.fn()
        const onResize = vi.fn()
        const onResizeEnd = vi.fn()
        const { getByRole } = render(
            <SidebarResizeHandle width={256} onResize={onResize} onResizeStart={vi.fn()} onResizeEnd={onResizeEnd} />
        )
        const handle = getByRole("separator")
        fireEvent.pointerDown(handle, { button: 0, pointerId: 1, clientX: 256 })
        fireEvent.pointerMove(handle, { pointerId: 1, clientX: 500 })
        fireEvent.pointerUp(handle, { pointerId: 1, clientX: 500 })
        expect(onResize).toHaveBeenLastCalledWith(400)
        expect(onResizeEnd).toHaveBeenCalledWith(400)
    })

    it("ignores drag attempts at tablet width and with a coarse pointer", () => {
        const onResize = vi.fn()
        const onResizeEnd = vi.fn()
        for (const [width, finePointer] of [[900, true], [1280, false]] as const) {
            setViewport(width, finePointer)
            const { getByRole, unmount } = render(
                <SidebarResizeHandle width={256} onResize={onResize} onResizeStart={vi.fn()} onResizeEnd={onResizeEnd} />
            )
            const handle = getByRole("separator")
            fireEvent.pointerDown(handle, { button: 0, pointerId: 1, clientX: 256 })
            fireEvent.pointerMove(handle, { pointerId: 1, clientX: 340 })
            fireEvent.pointerUp(handle, { pointerId: 1, clientX: 340 })
            unmount()
        }
        expect(onResize).not.toHaveBeenCalled()
        expect(onResizeEnd).not.toHaveBeenCalled()
    })

    it("supports keyboard adjustments on desktop", () => {
        setViewport(1280)
        const onResize = vi.fn()
        const onResizeEnd = vi.fn()
        const { getByRole } = render(
            <SidebarResizeHandle width={256} onResize={onResize} onResizeStart={vi.fn()} onResizeEnd={onResizeEnd} />
        )
        fireEvent.keyDown(getByRole("separator"), { key: "ArrowRight" })
        expect(onResize).toHaveBeenCalledWith(272)
        expect(onResizeEnd).toHaveBeenCalledWith(272)
    })
})
