import type { LucideIcon } from "lucide-react"
import type { ReactNode } from "react"

interface PageHeaderProps {
    icon?: LucideIcon
    title: string
    description?: string
    actions?: ReactNode
    /** Small uppercase kicker above the title (e.g. "Strategic HQ") */
    kicker?: string
    kickerIcon?: LucideIcon
}

/**
 * Consistent header for every main page. Pairs with PageShell.
 *
 * Layout: [kicker line]  /  [icon + title row] + description on left,
 * actions slot on right (buttons, filters, etc).
 */
export function PageHeader({
    icon: Icon,
    title,
    description,
    actions,
    kicker,
    kickerIcon: KickerIcon,
}: PageHeaderProps) {
    return (
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between pb-6 border-b">
            <div className="space-y-1">
                {kicker && (
                    <div className="flex items-center gap-2 text-primary">
                        {KickerIcon && <KickerIcon className="size-4" />}
                        <span className="text-xs font-bold uppercase tracking-widest">{kicker}</span>
                    </div>
                )}
                <div className="flex items-center gap-3">
                    {Icon && <Icon className="size-7 text-primary shrink-0" />}
                    <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{title}</h1>
                </div>
                {description && (
                    <p className="text-sm text-muted-foreground italic ml-0 max-w-2xl">
                        {description}
                    </p>
                )}
            </div>
            {actions && (
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {actions}
                </div>
            )}
        </div>
    )
}
