export type UserRole = 'super_admin' | 'rodier_admin' | 'technician' | 'client_hq' | 'client_store'
export type StoreStatus = 'active' | 'inactive' | 'maintenance'
export type JobType = 'fault' | 'maintenance' | 'project'
export type JobStatus = 'open' | 'in_progress' | 'resolved' | 'closed'
export type Severity = 'low' | 'medium' | 'high' | 'critical'

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
