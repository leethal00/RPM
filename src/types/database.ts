export type UserRole = 'super_admin' | 'rodier_admin' | 'technician' | 'client_hq' | 'client_store'
export type StoreStatus = 'active' | 'inactive' | 'maintenance'
export type JobType = 'fault' | 'maintenance' | 'project'
export type JobStatus = 'open' | 'in_progress' | 'resolved' | 'closed'
export type Severity = 'low' | 'medium' | 'high' | 'critical'
export type CostingStatus = 'quote' | 'quoted' | 'approved' | 'in_progress' | 'complete' | 'invoiced' | 'cancelled'

export interface Client {
  id: string
  name: string
  logo_url: string | null
  primary_color: string | null
  contact_email: string | null
  active: boolean
  created_at: string
  updated_at: string
}

export interface UserProfile {
  id: string
  email: string
  name: string | null
  role: UserRole
  client_id: string | null
  store_ids: string[]
  avatar_url: string | null
  developer_mode: boolean
  created_at: string
  updated_at: string
}

export interface Store {
  id: string
  client_id: string
  name: string
  region: string | null
  address: string | null
  lat: number | null
  lng: number | null
  location_approximate: boolean
  manager_name: string | null
  manager_phone: string | null
  rodier_account_manager_id: string | null
  status: StoreStatus
  site_type: string | null
  site_category: string | null
  maintenance_score: number | null
  hours_of_operation: string | null
  has_drive_thru: boolean
  created_at: string
  updated_at: string
  // Joined relations
  assets?: Asset[]
  jobs?: Job[]
  projects?: Project[]
  clients?: Client
  site_photos?: SitePhoto[]
  store_brands?: { brand_id: string; client_brands?: ClientBrand }[]
}

export interface ClientBrand {
  id: string
  client_id: string
  key: string
  label: string
  logo_url: string | null
  color: string | null
  display_order: number
  created_at: string
  updated_at: string
}

export interface AssetType {
  id: string
  label: string
  default_interval_days: number
  icon_name: string | null
  created_at: string
}

export interface Asset {
  id: string
  store_id: string
  name: string | null
  asset_type_id: string | null
  install_date: string | null
  last_service_date: string | null
  next_service_date: string | null
  service_interval_days: number | null
  pm_interval_months: number | null
  status: string | null
  asset_group: string | null
  asset_details: string | null
  asset_dimensions: string | null
  notes: string | null
  created_at: string
  updated_at: string
  // Joined relations
  asset_types?: AssetType
  asset_photos?: AssetPhoto[]
  stores?: Store
  jobs?: Job[]
}

export interface Job {
  id: string
  store_id: string
  asset_id: string | null
  vendor_id: string | null
  project_id: string | null
  job_type: JobType
  title: string
  description: string | null
  severity: Severity | null
  status: JobStatus
  reported_by: string
  assigned_to: string | null
  resolved_at: string | null
  responded_at: string | null
  budget_impact: number | null
  photos: string[]
  media_urls: string[]
  created_at: string
  updated_at: string
  // Joined relations
  stores?: Store
  assets?: Asset
  vendors?: Vendor
  projects?: Project
  reporter?: UserProfile
  assignee?: UserProfile
}

export interface Project {
  id: string
  name: string
  description: string | null
  status: string
  budget: number
  start_date: string | null
  end_date: string | null
  store_id: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  // Joined relations
  stores?: Store
  jobs?: Job[]
}

// ── Job Costing module ───────────────────────────────────────────────
// Rodier-internal signage costing. New `costing_*` tables; see
// docs/job-costing-data-model.md. Not exposed to client roles.

export interface Material {
  id: string
  code: string | null
  description: string
  supplier: string | null
  unit: string | null
  unit_cost: number
  default_markup: number
  section: string
  subsection: string | null
  date_last_checked: string | null
  check_note: string | null
  is_labour: boolean
  watts: number | null   // LED module consumption / transformer capacity
  mtr_weight: number | null // steel: kg per metre (per sheet for plate) -> seeds galvanising weight
  active: boolean
  created_at: string
  updated_at: string
}

export interface CostingSection {
  id: number
  section: string
  subsection: string | null
  sort: number
}

export interface CostingSupplier {
  id: string
  name: string
  created_at: string
}

export interface CostingJob {
  id: string
  job_number: string | null
  title: string
  client_id: string | null
  store_id: string | null
  reference: string | null
  details: string | null
  quoted_by: string | null
  qty: number
  status: CostingStatus
  adjusted_total: number | null
  xero_quote_id: string | null
  xero_quote_number: string | null
  xero_invoice_number: string | null
  folder_ref: string | null
  notes: string | null
  is_template: boolean
  created_by: string | null
  created_at: string
  updated_at: string
  // Joined relations
  clients?: Client | null
  stores?: Store | null
  costing_lines?: CostingLine[]
}

export interface CostingLine {
  id: string
  job_id: string
  item_id: string | null
  section: string
  subsection: string | null
  sort: number
  material_id: string | null
  description: string
  supplier: string | null
  qty: number
  unit_cost: number
  markup: number
  unit_sell_override: number | null
  internal_note: string | null
  weight_kg: number | null
  wt_factor: number | null  // kg/m (linear) or kg/m² (plate)
  wt_size: number | null     // length (m) or area (m²)
  wt_qty: number | null      // number of pieces
  watts: number | null       // LED module consumption / transformer capacity
  line_cost: number // generated
  line_sell: number // generated
  created_at: string
  updated_at: string
}

export type CostingItemMode = "simple" | "build"

export interface CostingItem {
  id: string
  job_id: string
  name: string
  sign_code: string | null
  size: string | null
  details: string | null
  delivery: string | null
  mode: CostingItemMode
  qty: number
  unit_cost: number   // simple items
  unit_price: number  // simple items (sell)
  sort: number
  created_at: string
  updated_at: string
  // computed in app for build items
  costing_lines?: CostingLine[]
}

export interface CostingTimeEntry {
  id: string
  job_id: string
  work_date: string | null
  user_id: string | null
  person_name: string | null
  hours: number
  description: string | null
  labour_type: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface CostingMaterialActual {
  id: string
  job_id: string
  order_date: string | null
  supplier: string | null
  description: string | null
  qty: number | null
  cost: number | null
  material_id: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface Vendor {
  id: string
  client_id: string | null
  name: string
  trade: string
  email: string | null
  phone: string | null
  account_code: string | null
  status: string
  created_at: string
  updated_at: string
}

export interface Region {
  id: string
  name: string
  created_at: string
}

export interface MaintenanceSchedule {
  id: string
  asset_id: string
  task_name: string
  frequency_days: number
  last_completed_at: string | null
  next_due_at: string
  created_at: string
}

export interface SitePhoto {
  id: string
  store_id: string
  url: string
  caption: string | null
  internal_only: boolean
  is_primary: boolean
  created_at: string
  updated_at: string
}

export interface AssetPhoto {
  id: string
  asset_id: string
  url: string
  caption: string | null
  internal_only: boolean
  created_at: string
}
