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
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between pb-5 border-b border-border/60">
            <div className="space-y-1.5">
                {kicker && (
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                        {KickerIcon && <KickerIcon className="size-3.5" />}
                        <span className="text-xs font-medium">{kicker}</span>
                    </div>
                )}
                <div className="flex items-center gap-2.5">
                    {Icon && <Icon className="size-5 text-muted-foreground shrink-0" />}
                    <h1 className="text-[1.7rem] font-semibold tracking-tight text-foreground">{title}</h1>
                </div>
                {description && (
                    <p className="text-sm text-muted-foreground max-w-2xl">
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
