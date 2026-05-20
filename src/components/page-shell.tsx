import type { ReactNode } from "react"

interface PageShellProps {
    children: ReactNode
    /** "wide" — for data-dense pages (default), "narrow" — for forms/profile, "full" — edge-to-edge */
    width?: "narrow" | "wide" | "full"
    className?: string
}

const WIDTHS = {
    narrow: "max-w-3xl",
    wide: "max-w-7xl",
    full: "max-w-none",
} as const

/**
 * Consistent page container. Removes the "lonely table floating in the middle"
 * problem by giving every page a sensible width and consistent vertical spacing.
 *
 * Use:
 *   <PageShell>
 *     <PageHeader title="..." />
 *     ...content...
 *   </PageShell>
 */
export function PageShell({ children, width = "wide", className = "" }: PageShellProps) {
    return (
        <div className={`flex flex-col gap-6 py-6 ${WIDTHS[width]} w-full mx-auto font-primary ${className}`}>
            {children}
        </div>
    )
}
