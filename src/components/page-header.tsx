import type { LucideIcon } from "lucide-react"
import type { ReactNode } from "react"

interface PageHeaderProps {
    icon?: LucideIcon
    title: string
    description?: string
    actions?: ReactNode
    /** Small label above the title (e.g. "Strategic HQ") */
    kicker?: string
    kickerIcon?: LucideIcon
}

export function PageHeader({
    icon: Icon,
    title,
    description,
    actions,
    kicker,
    kickerIcon: KickerIcon,
}: PageHeaderProps) {
    return (
        <div className="flex flex-col gap-1.5 md:flex-row md:items-end md:justify-between pb-2.5 border-b border-border/60">
            <div className="min-w-0">
                {kicker && (
                    <div className="mb-0.5 flex items-center gap-1.5 text-muted-foreground">
                        {KickerIcon && <KickerIcon className="size-3.5" />}
                        <span className="text-xs font-medium">{kicker}</span>
                    </div>
                )}
                <div className="flex min-w-0 flex-col gap-0.5 md:flex-row md:items-baseline md:gap-3">
                    <div className="flex shrink-0 items-center gap-2">
                        {Icon && <Icon className="size-5 text-muted-foreground shrink-0" />}
                        <h1 className="text-2xl font-bold tracking-tight text-foreground leading-tight">{title}</h1>
                    </div>
                    {description && (
                        <p className="min-w-0 text-sm text-muted-foreground leading-snug md:truncate">
                            {description}
                        </p>
                    )}
                </div>
            </div>
            {actions && (
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {actions}
                </div>
            )}
        </div>
    )
}
