import { z } from 'zod'

const nzPhoneRegex = /^(\+?64|0)\d{7,10}$/

export const siteSchema = z.object({
  name: z.string().min(1, "Site name is required").max(200, "Site name must be under 200 characters"),
  address: z.string().min(1, "Address is required"),
  lat: z.number().min(-90).max(90).nullable().optional(),
  lng: z.number().min(-180).max(180).nullable().optional(),
  manager_phone: z.string()
    .regex(nzPhoneRegex, "Invalid NZ phone number (e.g. 021 123 456 or +6421123456)")
    .or(z.literal(""))
    .optional(),
})

export const assetSchema = z.object({
  asset_type_id: z.string().uuid("Please select an asset type"),
  install_date: z.string().optional(),
  service_interval_days: z.number().int().positive("Service interval must be a positive number").optional(),
})

export const jobSchema = z.object({
  title: z.string().min(1, "Job title is required").max(500, "Title must be under 500 characters"),
  description: z.string().max(5000, "Description must be under 5000 characters").optional(),
  severity: z.enum(["low", "medium", "high", "critical"], { message: "Invalid severity level" }),
  job_type: z.enum(["fault", "maintenance", "project"], { message: "Invalid job type" }),
})

export const vendorSchema = z.object({
  name: z.string().min(1, "Vendor name is required"),
  trade: z.string().min(1, "Trade is required"),
  email: z.string().email("Invalid email address").or(z.literal("")).optional(),
  phone: z.string().optional(),
})

export const projectSchema = z.object({
  name: z.string().min(1, "Project name is required").max(200, "Project name must be under 200 characters"),
  budget: z.number().min(0, "Budget cannot be negative").optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
}).refine(
  (data) => {
    if (data.start_date && data.end_date) {
      return new Date(data.end_date) >= new Date(data.start_date)
    }
    return true
  },
  { message: "End date must be on or after start date", path: ["end_date"] }
)

export const loginSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
})
