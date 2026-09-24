import { isHourUnit } from "@/lib/costing/bom-hours"

export const WORKLOAD_DEPARTMENTS = {
    cnc: "CNC",
    metalshop: "Metalshop",
    fabrication: "Acrylic fab/wiring/finishing",
    installation: "Installation",
} as const
export type WorkloadDepartment = keyof typeof WORKLOAD_DEPARTMENTS

export interface BomWorkLine {
    job_id: string
    section: string
    subsection: string | null
    description: string
    qty: number
    materials: { is_labour: boolean; unit: string | null } | null
    costing_items: { qty: number; mode: string } | null
}

/** Raw material quantities and incidental charges must never become labour hours. */
export function bomWork(line: BomWorkLine): { department: WorkloadDepartment; hours: number | null } | null {
    if (line.section.trim().toLowerCase() !== "labour" && !line.materials?.is_labour) return null
    const description = line.description.toLowerCase()
    if (/outsource|\bkm\b|kilomet|mileage|allowance|accommodation|callout|project management|administration/.test(description)) return null
    if (line.costing_items?.mode === "simple") return null
    // Match the costing item total. build_qty describes the batch; it is not another multiplier.
    const quantity = Number(line.qty) * Number(line.costing_items?.qty ?? 1)
    if (!Number.isFinite(quantity) || quantity <= 0) return null
    const text = `${line.subsection ?? ""} ${description}`.toLowerCase()
    let department: WorkloadDepartment | null = null
    if (/install|site time|site work|site clean/.test(text)) department = "installation"
    else if (/travel/.test(description)) return null
    else if (/\bcnc\b|router|routing|design|drawing|programming|laser cutter/.test(text)) department = "cnc"
    else if (/metal|weld|press brake|guillotine/.test(text)) department = "metalshop"
    else if (/acrylic|wir(?:e|ing)|electrical|finish|paint|polish|assembl|vinyl|print|\bpack\b/.test(text)) department = "fabrication"
    if (!department) return null
    // Existing labour catalogue records have no unit; their BOM quantity is hours.
    const hours = isHourUnit(line.materials?.unit) ? quantity : null
    return { department, hours }
}

export function actualDepartment(code: string): WorkloadDepartment | null {
    const normalized = code.trim().toLowerCase()
    if (["cnc", "design"].includes(normalized)) return "cnc"
    if (["metalshop", "metalwork", "metal", "welding"].includes(normalized)) return "metalshop"
    if (["fabrication", "assembly", "finishing", "acrylic", "wiring"].includes(normalized)) return "fabrication"
    if (["installation", "install"].includes(normalized)) return "installation"
    return null
}
