import { z } from "zod"

const nzPhoneRegex = /^(\+?64|0)\s?\d{1,4}[\s-]?\d{3,4}[\s-]?\d{3,4}$/

export const siteSchema = z.object({
  name: z.string().min(1, "Site name is required").max(200, "Site name must be 200 characters or less"),
  address: z.string().min(1, "Address is required"),
  lat: z.number().min(-90).max(90).nullable(),
  lng: z.number().min(-180).max(180).nullable(),
  manager_phone: z.string().regex(nzPhoneRegex, "Invalid NZ phone number").or(z.literal("")).optional(),
  region: z.string().optional(),
  manager_name: z.string().optional(),
  status: z.enum(["active", "inactive", "maintenance"]),
  client_id: z.string().uuid("Please select a customer"),
  brand_ids: z.array(z.string().uuid()).default([]),
  site_category: z.string(),
  has_drive_thru: z.boolean(),
})

export const assetSchema = z.object({
  asset_type_id: z.string().uuid("Please select an asset type"),
  asset_group: z.enum(["external", "internal"]),
  install_date: z.string().refine((val) => !val || !isNaN(Date.parse(val)), "Invalid date").optional().or(z.literal("")),
  status: z.enum(["active", "maintenance", "inactive"]),
  asset_details: z.string().optional(),
  asset_dimensions: z.string().optional(),
  last_service_date: z.string().optional().or(z.literal("")),
  next_service_date: z.string().optional().or(z.literal("")),
  pm_interval_months: z.number().int().min(1, "PM interval must be at least 1 month").max(120, "PM interval must be 120 months or less"),
})

export const jobSchema = z.object({
  title: z.string().min(1, "Job title is required").max(500, "Title must be 500 characters or less"),
  description: z.string().max(5000, "Description must be 5000 characters or less").optional().or(z.literal("")),
  severity: z.enum(["low", "medium", "high", "critical"]),
  job_type: z.enum(["fault", "maintenance", "project"]),
  asset_id: z.string().optional(),
  project_id: z.string().optional(),
  vendor_id: z.string().optional(),
})

export const vendorSchema = z.object({
  name: z.string().min(1, "Vendor name is required"),
  trade: z.string().min(1, "Trade is required"),
  email: z.string().email("Invalid email address").or(z.literal("")).optional(),
  phone: z.string().regex(nzPhoneRegex, "Invalid NZ phone number").or(z.literal("")).optional(),
  account_code: z.string().optional(),
  status: z.enum(["active", "inactive"]),
})

export const projectSchema = z.object({
  name: z.string().min(1, "Project name is required").max(200, "Project name must be 200 characters or less"),
  description: z.string().optional().or(z.literal("")),
  status: z.enum(["planning", "in_progress", "completed", "archived"]),
  budget: z.string().refine((val) => !val || (!isNaN(Number(val)) && Number(val) >= 0), "Budget must be a non-negative number").optional().or(z.literal("")),
  start_date: z.string().optional().or(z.literal("")),
  end_date: z.string().optional().or(z.literal("")),
  store_id: z.string().optional(),
}).refine(
  (data) => {
    if (data.start_date && data.end_date) {
      return new Date(data.end_date) >= new Date(data.start_date)
    }
    return true
  },
  { message: "End date must be on or after start date", path: ["end_date"] }
)

export const costingJobSchema = z.object({
  title: z.string().min(2, "Job title is required").max(200, "Job title must be 200 characters or less"),
  reference: z.string().max(200).optional().or(z.literal("")),
  details: z.string().optional().or(z.literal("")),
  qty: z.string().refine((val) => !val || (!isNaN(Number(val)) && Number(val) > 0), "Qty must be a positive number").optional().or(z.literal("")),
  client_id: z.string().optional(),
  store_id: z.string().optional(),
})

export const loginSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
})

export function getValidationErrors(result: { success: boolean; error?: { issues: { message: string }[] } }): string[] {
  if (result.success) return []
  return result.error?.issues.map((e) => e.message) ?? []
}
