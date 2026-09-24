import { z } from "zod"

export const DEPARTMENTS = {
    cnc: "CNC",
    design: "Design",
    metalwork: "Metalwork",
    finishing: "Paint / Finishing",
    assembly: "Assembly",
    installation: "Installation",
} as const
export type DepartmentCode = keyof typeof DEPARTMENTS

export const OPERATION_STATUSES = {
    not_ready: "Not Ready",
    ready: "Ready",
    scheduled: "Scheduled",
    in_progress: "In Progress",
    paused: "Paused",
    complete: "Complete",
} as const
export type OperationStatus = keyof typeof OPERATION_STATUSES

export const operationSchema = z.object({
    job_id: z.uuid(),
    department_code: z.enum(Object.keys(DEPARTMENTS) as [DepartmentCode, ...DepartmentCode[]]),
    name: z.string().trim().min(1, "Enter an operation name").max(160),
    sequence: z.number().int().min(0).max(9999),
    status: z.enum(Object.keys(OPERATION_STATUSES) as [OperationStatus, ...OperationStatus[]]),
    estimated_hours: z.number().min(0).max(999999).nullable(),
    due_date: z.iso.date().nullable(),
    progress_percent: z.number().int().min(0).max(100).nullable(),
    blocker_reason: z.string().trim().max(1000).nullable(),
}).superRefine((value, ctx) => {
    if (value.status !== "complete" && value.progress_percent === 100) {
        ctx.addIssue({ code: "custom", path: ["progress_percent"], message: "Use Complete status for 100% progress" })
    }
})

export type OperationInput = z.infer<typeof operationSchema>
export interface PlanningOperation extends OperationInput {
    id: string
    updated_at: string
    job_number: string | null
    job_title: string
    job_status: string
    client_id: string | null
    client_name: string | null
    effective_due_date: string | null
    actual_hours: number | null
}
export interface PlanningJob {
    id: string
    job_number: string | null
    title: string
    production_title?: string | null
}

export function canManagePlanning(role: string | null | undefined) {
    return role === "super_admin" || role === "rodier_admin"
}

/** Completion is recorded by a person, never inferred from hours consumed. */
export function operationProgress(operation: Pick<PlanningOperation, "status" | "progress_percent">) {
    return operation.status === "complete" ? 100 : operation.progress_percent
}

export function formatHours(hours: number | null) {
    return hours === null ? "—" : `${hours.toLocaleString("en-NZ", { maximumFractionDigits: 2 })} h`
}
