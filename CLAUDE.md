# RPM (Rodier Preventive Maintenance) - AI Agent Implementation Guide

**Version:** 1.0
**Last Updated:** March 11, 2026
**Application Type:** Next.js 14+ App Router, Supabase Backend, Multi-tenant SaaS

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Architecture & Tech Stack](#architecture--tech-stack)
3. [Database Schema](#database-schema)
4. [File Structure](#file-structure)
5. [Authentication & Authorization](#authentication--authorization)
6. [Multi-tenancy & Data Isolation](#multi-tenancy--data-isolation)
7. [Component Patterns](#component-patterns)
8. [Data Fetching Patterns](#data-fetching-patterns)
9. [Form Patterns](#form-patterns)
10. [Styling Conventions](#styling-conventions)
11. [Map Integration](#map-integration)
12. [File Upload & Storage](#file-upload--storage)
13. [Common Implementation Tasks](#common-implementation-tasks)
14. [Common Pitfalls](#common-pitfalls)
15. [Testing & Deployment](#testing--deployment)

---

## Project Overview

RPM is a **signage asset management platform** for Rodier Preventive Maintenance, serving multiple restaurant brands (St Pierre's Sushi, Bento Bowl, K10 Sushi Train) across New Zealand.

### Core Features
- **Asset Management**: Track signage assets (digital menu boards, pylon signs, fascia signs, lightboxes) across store locations
- **Job/Ticket System**: Report faults, schedule maintenance, track work orders
- **Preventive Maintenance**: Schedule and track PM cycles for all assets
- **Multi-tenant Architecture**: Support multiple clients with data isolation
- **Interactive Map**: Leaflet-based map showing all store locations
- **Vendor Management**: Track contractors and service providers
- **HQ Projects**: Strategic initiatives and capital expenditure tracking
- **Analytics Dashboard**: Charts and metrics for asset health and job distribution

### User Roles
1. **super_admin**: Full system access across all clients
2. **rodier_admin**: Rodier company staff with cross-client access
3. **technician**: Field technicians assigned to specific stores
4. **client_hq**: Client headquarters staff viewing their locations
5. **client_store**: Store managers viewing only their assigned store

---

## Architecture & Tech Stack

### Framework & Runtime
- **Next.js 16.1.6** (App Router, React 19)
- **React 19.2.3** (Client-side only, no server components used)
- **TypeScript 5**
- **Node.js 22+**

### Backend & Database
- **Supabase** (PostgreSQL + Auth + Storage + Realtime)
- **Direct client-side queries** (no API routes)
- **Row Level Security (RLS)** for data isolation

### UI & Styling
- **Tailwind CSS v4** (latest)
- **shadcn/ui** (New York style)
- **Lucide React** (icons)
- **next-themes** (dark mode support)
- **Sonner** (toast notifications)

### Maps & Charts
- **Leaflet** + **react-leaflet** (interactive maps)
- **Recharts** (analytics charts)

### Key Architectural Decisions
- ✅ **Client-side rendering only**: All pages use `"use client"` directive
- ✅ **Direct Supabase queries**: No API routes, queries directly from components
- ✅ **useState for state**: No global state management (Redux, Zustand, etc.)
- ✅ **Cookie-based auth**: SSR-compatible authentication via middleware
- ✅ **Multi-tenant by design**: All data scoped to client_id

---

## Database Schema

### Core Tables

#### 1. **clients** (Multi-tenant root)
```sql
CREATE TABLE clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  logo_url TEXT,
  primary_color TEXT,
  contact_email TEXT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```
**Purpose**: Root entity for multi-tenancy. All other data belongs to a client.

---

#### 2. **users** (Extends auth.users)
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT,
  role user_role NOT NULL DEFAULT 'client_store',
  client_id UUID REFERENCES clients(id),
  store_ids UUID[] DEFAULT '{}',
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```
**Purpose**: Application-level user profile linked to Supabase Auth.
**Key Fields**:
- `role`: Enum (super_admin, rodier_admin, technician, client_hq, client_store)
- `client_id`: Which client this user belongs to (NULL for super admins)
- `store_ids`: Array of store UUIDs this user can access

---

#### 3. **stores** (Physical locations/sites)
```sql
CREATE TABLE stores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  region TEXT,
  address TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  manager_name TEXT,
  manager_phone TEXT,
  rodier_account_manager_id UUID REFERENCES users(id),
  status store_status DEFAULT 'active', -- ENUM: active, inactive, maintenance

  -- Brand flags
  brand_st_pierres BOOLEAN DEFAULT true,
  brand_bento_bowl BOOLEAN DEFAULT false,
  brand_k10 BOOLEAN DEFAULT false,

  -- Site details
  site_type TEXT,
  site_category TEXT DEFAULT 'Stand alone', -- Stand alone, Food court
  maintenance_score NUMERIC(3, 1),
  hours_of_operation TEXT, -- JSON string
  has_drive_thru BOOLEAN DEFAULT false,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```
**Purpose**: Physical store locations where assets are installed.
**Multi-brand Support**: A store can have multiple brand flags set (e.g., St Pierre's + Bento Bowl co-located).

---

#### 4. **asset_types** (Asset catalog)
```sql
CREATE TABLE asset_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label TEXT NOT NULL,
  default_interval_days INTEGER DEFAULT 365,
  icon_name TEXT, -- Lucide icon name
  created_at TIMESTAMPTZ DEFAULT now()
);
```
**Purpose**: Catalog of asset types (Digital Menu Board, Pylon Sign, etc.).
**Examples**: Digital Menu Board (180 days), Pylon Sign (365 days), Fascia Sign (365 days)

---

#### 5. **assets** (Physical signage assets)
```sql
CREATE TABLE assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  asset_type_id UUID REFERENCES asset_types(id),
  install_date DATE,
  last_service_date DATE,
  next_service_date DATE,
  service_interval_days INTEGER,
  status TEXT, -- operational, needs_service, faulty

  -- Additional fields
  asset_group TEXT, -- internal, external
  asset_details TEXT,
  asset_dimensions TEXT,
  notes TEXT,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```
**Purpose**: Physical signage assets at stores.
**Relationships**: Belongs to store, has type, generates jobs/maintenance schedules.

---

#### 6. **jobs** (Work tickets/tasks)
```sql
CREATE TABLE jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  asset_id UUID REFERENCES assets(id),
  vendor_id UUID REFERENCES vendors(id),
  project_id UUID REFERENCES projects(id),

  job_type job_type NOT NULL, -- ENUM: fault, maintenance, project
  title TEXT NOT NULL,
  description TEXT,
  severity TEXT, -- low, medium, high, critical
  status job_status DEFAULT 'open', -- ENUM: open, in_progress, resolved, closed

  reported_by UUID NOT NULL REFERENCES users(id),
  assigned_to UUID REFERENCES users(id),
  resolved_at TIMESTAMPTZ,
  budget_impact NUMERIC(10, 2),

  photos TEXT[] DEFAULT '{}',
  media_urls TEXT[] DEFAULT '{}',

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```
**Purpose**: Work tickets for faults, maintenance, and project tasks.
**Job Types**:
- `fault`: Reactive repair (e.g., "Pylon sign not lit")
- `maintenance`: Scheduled PM work
- `project`: HQ-initiated strategic work

---

#### 7. **projects** (HQ strategic initiatives)
```sql
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'planning', -- planning, in_progress, completed, archived
  budget NUMERIC(10, 2) DEFAULT 0,
  start_date DATE,
  end_date DATE,
  store_id UUID REFERENCES stores(id) ON DELETE SET NULL,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```
**Purpose**: Strategic HQ projects that bundle multiple jobs (e.g., "Takapuna Store Refresh 2026").

---

#### 8. **vendors** (Service providers/contractors)
```sql
CREATE TABLE vendors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  trade TEXT NOT NULL, -- Signage, Electrical, HVAC, etc.
  email TEXT,
  phone TEXT,
  account_code TEXT,
  status TEXT DEFAULT 'active', -- active, inactive
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```
**Purpose**: Contractors who perform work. Linked to jobs.

---

#### 9. **regions**
```sql
CREATE TABLE regions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE, -- Auckland, Wellington, etc.
  created_at TIMESTAMPTZ DEFAULT now()
);
```
**Purpose**: Geographic regions for organizing stores.

---

#### 10. **maintenance_schedules**
```sql
CREATE TABLE maintenance_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID REFERENCES assets(id) ON DELETE CASCADE,
  task_name TEXT NOT NULL,
  frequency_days INTEGER NOT NULL,
  last_completed_at TIMESTAMPTZ,
  next_due_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
```
**Purpose**: PM schedule tracking for assets.

---

#### 11. **site_photos** & **asset_photos**
```sql
CREATE TABLE site_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE asset_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
```
**Purpose**: Photo galleries for stores and assets.

---

### Database Relationships Diagram

```
clients (1)
  ├─> stores (many)
  │     ├─> assets (many)
  │     │     ├─> asset_photos (many)
  │     │     ├─> maintenance_schedules (many)
  │     │     └─> jobs (many)
  │     ├─> site_photos (many)
  │     ├─> jobs (many)
  │     └─> projects (many)
  ├─> vendors (many)
  └─> users (many)

asset_types (catalog)
  └─> assets (many)

regions (catalog)
  └─> stores (many - via region text field)

projects (1)
  └─> jobs (many - via project_id)

vendors (1)
  └─> jobs (many - via vendor_id)
```

---

## File Structure

### App Router Structure (`/src/app/`)

```
src/app/
├── layout.tsx                 # Root layout (global providers, fonts)
├── page.tsx                   # Home page (map view)
├── login/page.tsx             # Login page
├── profile/page.tsx           # User profile
│
├── stores/
│   ├── page.tsx               # Store list/portfolio
│   ├── [id]/page.tsx          # Store detail (assets, jobs, projects)
│   └── [id]/assets/[assetId]/page.tsx  # Asset detail
│
├── jobs/
│   ├── page.tsx               # Job logs (all tickets)
│   ├── new/page.tsx           # Report new fault
│   └── [id]/page.tsx          # Job detail
│
├── maintenance/
│   ├── page.tsx               # Maintenance dashboard
│   └── pm/page.tsx            # PM scheduler
│
├── analysis/page.tsx          # Analytics dashboard
│
├── projects/
│   ├── page.tsx               # HQ projects list
│   └── [id]/page.tsx          # Project detail
│
├── vendors/page.tsx           # Vendor management
│
└── settings/
    ├── page.tsx               # Main settings
    ├── customers/page.tsx     # Client management
    ├── regions/page.tsx       # Region management
    └── asset-types/page.tsx   # Asset type catalog
```

### Components Structure (`/src/components/`)

```
src/components/
├── ui/                        # shadcn/ui components (20 components)
│   ├── button.tsx
│   ├── card.tsx
│   ├── dialog.tsx
│   ├── input.tsx
│   ├── select.tsx
│   ├── table.tsx
│   ├── tabs.tsx
│   └── ... (17 more)
│
├── dashboard-layout.tsx       # Main app layout with sidebar
├── app-sidebar.tsx            # Navigation sidebar
│
├── store-map.tsx              # Leaflet map component
├── store-list.tsx             # Store list sidebar
├── store-header.tsx           # Store detail header
├── site-form.tsx              # Create/edit store
├── site-photo-gallery.tsx    # Store photos
│
├── asset-table.tsx            # Asset listing table
├── asset-form.tsx             # Create/edit asset
├── asset-photo-gallery.tsx   # Asset photos
├── asset-type-manager.tsx    # Asset type management
│
├── job-form.tsx               # Create/edit job
├── job-timeline.tsx           # Job history timeline
│
├── project-card.tsx           # Project card display
├── project-form.tsx           # Create/edit project
│
├── vendor-form.tsx            # Vendor form
│
├── maintenance-schedule-list.tsx  # PM schedule list
│
├── customer-manager.tsx       # Client management
└── region-manager.tsx         # Region management
```

### Lib Structure (`/src/lib/`)

```
src/lib/
├── supabase/
│   ├── client.ts              # Browser client (createClient)
│   ├── server.ts              # Server client (cookies-based)
│   ├── middleware.ts          # Auth middleware helpers
│   └── auth.ts                # Auth helpers (getUserRole, isAdmin)
│
└── utils.ts                   # cn() for class merging
```

---

## Authentication & Authorization

### Auth Setup

**Provider**: Supabase Auth with email/password
**Session Management**: Cookie-based SSR-compatible sessions
**Middleware Protection**: All routes except `/login` require authentication

### Auth Files

#### 1. Client-side Auth (`/src/lib/supabase/client.ts`)
```typescript
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```
**Usage**: Import in all client components for queries.

---

#### 2. Server-side Auth (`/src/lib/supabase/server.ts`)
```typescript
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name) { return cookieStore.get(name)?.value },
        set(name, value, options) { cookieStore.set({ name, value, ...options }) },
        remove(name, options) { cookieStore.set({ name, value: '', ...options }) }
      }
    }
  )
}
```
**Usage**: Currently **NOT USED** (all pages are client-side). Keep for future server component adoption.

---

#### 3. Middleware (`/src/middleware.ts`)
```typescript
import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  const supabase = createServerClient(...)
  const { data: { session } } = await supabase.auth.getSession()

  if (!session && request.nextUrl.pathname !== '/login') {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (session && request.nextUrl.pathname === '/login') {
    return NextResponse.redirect(new URL('/', request.url))
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)']
}
```
**Purpose**: Protects all routes, redirects unauthenticated users to `/login`.

---

#### 4. Auth Helpers (`/src/lib/supabase/auth.ts`)
```typescript
export async function getUserRole(supabase: SupabaseClient) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase
    .from('users')
    .select('role, client_id, store_ids')
    .eq('id', user.id)
    .single()

  return data
}

export async function isAdmin(supabase: SupabaseClient) {
  const userRole = await getUserRole(supabase)
  return userRole?.role === 'super_admin' || userRole?.role === 'rodier_admin'
}
```
**Usage**: Check user permissions in components.

---

### Login Flow

**File**: `/src/app/login/page.tsx`

```typescript
const handleLogin = async (e: React.FormEvent) => {
  e.preventDefault()
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password
  })

  if (!error) {
    router.push('/')
  } else {
    toast.error(error.message)
  }
}
```

**After login**: Middleware refreshes session and redirects to `/`.

---

## Multi-tenancy & Data Isolation

### Data Isolation Strategy

**All data is scoped by `client_id`** (except super admins).

### RLS Policies (Row Level Security)

**Example for stores table**:
```sql
CREATE POLICY client_isolation_stores ON stores FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
      AND users.client_id = stores.client_id
  )
);
```

**Super admins bypass RLS**:
```sql
CREATE POLICY super_admin_all ON clients FOR ALL USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
      AND users.role = 'super_admin'
  )
);
```

### Querying with Multi-tenancy

**✅ CORRECT** (RLS handles isolation):
```typescript
const { data: stores } = await supabase
  .from('stores')
  .select('*')
// RLS automatically filters by user's client_id
```

**❌ INCORRECT** (Don't manually filter by client_id):
```typescript
// Don't do this - RLS already handles it
const { data: stores } = await supabase
  .from('stores')
  .select('*')
  .eq('client_id', userClientId) // Redundant
```

### Store-level Access

Users have `store_ids[]` array for granular access:
```typescript
// Technician assigned to specific stores
const { data: user } = await supabase
  .from('users')
  .select('store_ids')
  .eq('id', userId)
  .single()

// Filter stores by user's access
const accessibleStores = stores.filter(s =>
  user.store_ids.includes(s.id)
)
```

---

## Component Patterns

### Standard Component Structure

**Pattern**: All pages are client components with this structure:

```typescript
"use client"

import { useEffect, useState } from "react"
import DashboardLayout from "@/components/dashboard-layout"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
// ... other imports

export default function PageName() {
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  const fetchData = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('table_name')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error:', error)
    } else {
      setData(data || [])
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchData()
  }, [])

  if (loading) {
    return (
      <DashboardLayout>
        <div className="p-8 animate-pulse">Loading...</div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <div className="p-6">
        {/* Page content */}
      </div>
    </DashboardLayout>
  )
}
```

### Layout Pattern

**All pages wrap content in `DashboardLayout`**:
```typescript
<DashboardLayout>
  {/* Your page content */}
</DashboardLayout>
```

**DashboardLayout provides**:
- Sidebar navigation (`app-sidebar.tsx`)
- Main content area
- Consistent padding and layout

---

### Dialog/Modal Pattern

**Use shadcn Dialog for forms**:
```typescript
const [isDialogOpen, setIsDialogOpen] = useState(false)

<Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
  <DialogTrigger asChild>
    <Button>
      <Plus className="size-4 mr-2" />
      Create New
    </Button>
  </DialogTrigger>
  <DialogContent className="sm:max-w-[600px]">
    <DialogHeader>
      <DialogTitle>Create Item</DialogTitle>
      <DialogDescription>Fill in the details below.</DialogDescription>
    </DialogHeader>
    <MyForm
      onSuccess={() => {
        setIsDialogOpen(false)
        fetchData() // Refresh list
      }}
      onCancel={() => setIsDialogOpen(false)}
    />
  </DialogContent>
</Dialog>
```

---

### Form Component Pattern

**Separate form into its own component**:

**File**: `/src/components/my-form.tsx`
```typescript
"use client"

import { useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"

interface MyFormProps {
  item?: any // For edit mode
  onSuccess: () => void
  onCancel: () => void
}

export function MyForm({ item, onSuccess, onCancel }: MyFormProps) {
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    name: item?.name || "",
    description: item?.description || ""
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    const { error } = await supabase
      .from('table_name')
      .upsert({
        id: item?.id,
        ...formData
      })

    setLoading(false)

    if (error) {
      toast.error(error.message)
    } else {
      toast.success(item ? "Updated!" : "Created!")
      onSuccess()
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          required
        />
      </div>

      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={loading}>
          {loading ? "Saving..." : "Save"}
        </Button>
      </div>
    </form>
  )
}
```

---

### Table/List Pattern

**Use shadcn Table for data lists**:
```typescript
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table"

<Table>
  <TableHeader>
    <TableRow>
      <TableHead>Name</TableHead>
      <TableHead>Status</TableHead>
      <TableHead>Actions</TableHead>
    </TableRow>
  </TableHeader>
  <TableBody>
    {items.map(item => (
      <TableRow key={item.id}>
        <TableCell>{item.name}</TableCell>
        <TableCell>
          <Badge variant={item.status === 'active' ? 'default' : 'secondary'}>
            {item.status}
          </Badge>
        </TableCell>
        <TableCell>
          <Button size="sm" variant="ghost">
            <Edit2 className="size-4" />
          </Button>
        </TableCell>
      </TableRow>
    ))}
  </TableBody>
</Table>
```

---

## Data Fetching Patterns

### Basic Fetch Pattern

```typescript
const { data, error } = await supabase
  .from('stores')
  .select('*')
  .order('created_at', { ascending: false })
```

### Fetch with Relations

```typescript
const { data, error } = await supabase
  .from('stores')
  .select(`
    *,
    assets (
      id,
      name,
      status
    ),
    jobs (
      id,
      status,
      created_at
    )
  `)
  .eq('id', storeId)
  .single()
```

### Fetch with Filters

```typescript
const { data, error } = await supabase
  .from('jobs')
  .select('*')
  .eq('status', 'open')
  .gte('created_at', startDate)
  .order('created_at', { ascending: false })
```

### Fetch with Joins (Manual)

```typescript
// Supabase handles joins via nested select
const { data: assets, error } = await supabase
  .from('assets')
  .select(`
    *,
    asset_types (
      label,
      icon_name
    ),
    stores (
      name,
      region
    )
  `)
  .eq('store_id', storeId)
```

### Insert Pattern

```typescript
const { data, error } = await supabase
  .from('stores')
  .insert({
    client_id: clientId,
    name: 'New Store',
    address: '123 Main St',
    status: 'active'
  })
  .select() // Return inserted row
  .single()
```

### Update Pattern

```typescript
const { error } = await supabase
  .from('stores')
  .update({
    name: 'Updated Name',
    updated_at: new Date().toISOString()
  })
  .eq('id', storeId)
```

### Upsert Pattern (Insert or Update)

```typescript
const { error } = await supabase
  .from('stores')
  .upsert({
    id: storeId, // If exists, update; else insert
    name: 'Store Name',
    address: 'Address'
  })
```

### Delete Pattern

```typescript
const { error } = await supabase
  .from('stores')
  .delete()
  .eq('id', storeId)
```

---

## Form Patterns

### Text Input

```typescript
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

<div>
  <Label htmlFor="name">Store Name</Label>
  <Input
    id="name"
    value={formData.name}
    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
    required
  />
</div>
```

### Select/Dropdown

```typescript
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

<div>
  <Label htmlFor="region">Region</Label>
  <Select
    value={formData.region}
    onValueChange={(value) => setFormData({ ...formData, region: value })}
  >
    <SelectTrigger>
      <SelectValue placeholder="Select region" />
    </SelectTrigger>
    <SelectContent>
      {regions.map(region => (
        <SelectItem key={region.id} value={region.name}>
          {region.name}
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
</div>
```

### Textarea

```typescript
import { Textarea } from "@/components/ui/textarea"

<div>
  <Label htmlFor="description">Description</Label>
  <Textarea
    id="description"
    value={formData.description}
    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
    rows={4}
  />
</div>
```

### Checkbox

```typescript
import { Checkbox } from "@/components/ui/checkbox"

<div className="flex items-center gap-2">
  <Checkbox
    id="has_drive_thru"
    checked={formData.has_drive_thru}
    onCheckedChange={(checked) =>
      setFormData({ ...formData, has_drive_thru: checked as boolean })
    }
  />
  <Label htmlFor="has_drive_thru">Has Drive-Thru</Label>
</div>
```

### Date Input

```typescript
<Input
  type="date"
  value={formData.install_date}
  onChange={(e) => setFormData({ ...formData, install_date: e.target.value })}
/>
```

### File Upload (see Storage section)

---

## Styling Conventions

### Tailwind CSS v4

**Import in globals.css**:
```css
@import "tailwindcss";
```

### Color Scheme

**Primary**: Forest Green (`#2D6A4F`)
**Accent**: Lighter Green (`#40916C`)
**Sidebar**: Dark Navy (`#1A1A2E`)

**CSS Variables** (in `/src/app/globals.css`):
```css
@theme {
  --color-primary: oklch(50.89% 0.121 163.24);
  --color-accent: oklch(61.42% 0.121 163.24);
  /* ... more theme vars */
}
```

### Common Utility Classes

```typescript
// Spacing
className="p-6"        // padding: 1.5rem
className="gap-4"      // gap: 1rem
className="space-y-4"  // > * + * { margin-top: 1rem }

// Layout
className="flex items-center justify-between"
className="grid grid-cols-3 gap-4"
className="max-w-7xl mx-auto"

// Typography
className="text-3xl font-bold"
className="text-sm text-muted-foreground"
className="uppercase tracking-widest"

// Borders & Shadows
className="border rounded-lg"
className="shadow-sm"

// States
className="hover:bg-accent"
className="disabled:opacity-50"
```

### Component Class Merging

**Use `cn()` utility**:
```typescript
import { cn } from "@/lib/utils"

<div className={cn(
  "base-class",
  isActive && "active-class",
  "conditional-class"
)} />
```

---

## Map Integration

### Leaflet Setup

**File**: `/src/components/store-map.tsx`

**Key Points**:
- **Dynamic import required**: Leaflet doesn't work with SSR
- **Map centered on NZ**: `[-40.9006, 174.8860]`
- **Markers for stores**: Custom icons with brand logos

### Example Map Component

```typescript
"use client"

import dynamic from 'next/dynamic'
import { useMemo } from 'react'

// Disable SSR for map
const MapContainer = dynamic(
  () => import('react-leaflet').then((mod) => mod.MapContainer),
  { ssr: false }
)
const TileLayer = dynamic(
  () => import('react-leaflet').then((mod) => mod.TileLayer),
  { ssr: false }
)
const Marker = dynamic(
  () => import('react-leaflet').then((mod) => mod.Marker),
  { ssr: false }
)
const Popup = dynamic(
  () => import('react-leaflet').then((mod) => mod.Popup),
  { ssr: false }
)

export function StoreMap({ stores }: { stores: any[] }) {
  return (
    <MapContainer
      center={[-40.9006, 174.8860]}
      zoom={5}
      style={{ height: '600px', width: '100%' }}
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; OpenStreetMap contributors'
      />
      {stores.map(store => (
        <Marker key={store.id} position={[store.lat, store.lng]}>
          <Popup>
            <strong>{store.name}</strong><br />
            {store.address}
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  )
}
```

### Geocoding Pattern

**Use Nominatim (OpenStreetMap)**:
```typescript
const lookupAddress = async () => {
  const response = await fetch(
    `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=5&countrycodes=nz`
  )
  const data = await response.json()

  if (data.length > 0) {
    setFormData({
      ...formData,
      lat: parseFloat(data[0].lat),
      lng: parseFloat(data[0].lon)
    })
  }
}
```

---

## File Upload & Storage

### Supabase Storage Buckets

1. **job-attachments**: Job photos/documents
2. **site-photos**: Store photos
3. **asset-photos**: Asset photos

**All buckets are public** (authenticated upload/delete).

### Upload Pattern

```typescript
const handleFileUpload = async (file: File) => {
  const fileName = `${Date.now()}-${file.name}`

  const { data, error } = await supabase.storage
    .from('site-photos')
    .upload(`${storeId}/${fileName}`, file, {
      cacheControl: '3600',
      upsert: false
    })

  if (error) {
    toast.error(error.message)
    return null
  }

  // Get public URL
  const { data: { publicUrl } } = supabase.storage
    .from('site-photos')
    .getPublicUrl(data.path)

  // Save URL to database
  await supabase
    .from('site_photos')
    .insert({
      store_id: storeId,
      url: publicUrl
    })

  return publicUrl
}
```

### Delete Pattern

```typescript
const handleDelete = async (photoId: string, url: string) => {
  // Extract file path from URL
  const path = url.split('/site-photos/')[1]

  // Delete from storage
  const { error: storageError } = await supabase.storage
    .from('site-photos')
    .remove([path])

  if (storageError) {
    toast.error(storageError.message)
    return
  }

  // Delete from database
  const { error: dbError } = await supabase
    .from('site_photos')
    .delete()
    .eq('id', photoId)

  if (!dbError) {
    toast.success("Photo deleted")
  }
}
```

---

## Common Implementation Tasks

### Task 1: Add a New Page

**Example: Create "/reports" page**

1. **Create page file**: `/src/app/reports/page.tsx`
```typescript
"use client"

import { useEffect, useState } from "react"
import DashboardLayout from "@/components/dashboard-layout"
import { createClient } from "@/lib/supabase/client"

export default function ReportsPage() {
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    async function fetchData() {
      setLoading(true)
      const { data } = await supabase.from('jobs').select('*')
      setData(data || [])
      setLoading(false)
    }
    fetchData()
  }, [])

  return (
    <DashboardLayout>
      <div className="p-6">
        <h1 className="text-3xl font-bold">Reports</h1>
        {/* Content */}
      </div>
    </DashboardLayout>
  )
}
```

2. **Add to sidebar**: `/src/components/app-sidebar.tsx`
```typescript
import { FileText } from "lucide-react"

{
  title: "Reports",
  url: "/reports",
  icon: FileText
}
```

---

### Task 2: Add a New Database Table

**Example: Add "notes" table**

1. **Create migration**: `/supabase/migrations/YYYYMMDDHHMMSS_add_notes_table.sql`
```sql
CREATE TABLE IF NOT EXISTS notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY notes_select ON notes FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM stores
    JOIN users ON users.client_id = stores.client_id
    WHERE stores.id = notes.store_id AND users.id = auth.uid()
  )
);
```

2. **Apply to dev**: Paste SQL in Supabase SQL Editor

3. **Create TypeScript interface** (if needed):
```typescript
interface Note {
  id: string
  store_id: string
  content: string
  created_by: string
  created_at: string
}
```

---

### Task 3: Add CRUD for New Entity

**Example: Manage "notes" for stores**

1. **Create form component**: `/src/components/note-form.tsx`
```typescript
"use client"

import { useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "sonner"

interface NoteFormProps {
  storeId: string
  note?: any
  onSuccess: () => void
  onCancel: () => void
}

export function NoteForm({ storeId, note, onSuccess, onCancel }: NoteFormProps) {
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [content, setContent] = useState(note?.content || "")

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    const { data: { user } } = await supabase.auth.getUser()

    const { error } = await supabase
      .from('notes')
      .upsert({
        id: note?.id,
        store_id: storeId,
        content,
        created_by: user?.id
      })

    setLoading(false)

    if (error) {
      toast.error(error.message)
    } else {
      toast.success(note ? "Note updated" : "Note added")
      onSuccess()
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Enter note..."
        rows={4}
        required
      />
      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={loading}>
          {loading ? "Saving..." : "Save"}
        </Button>
      </div>
    </form>
  )
}
```

2. **Add to store detail page**: `/src/app/stores/[id]/page.tsx`
```typescript
const [notes, setNotes] = useState<any[]>([])
const [isNoteDialogOpen, setIsNoteDialogOpen] = useState(false)

const fetchNotes = async () => {
  const { data } = await supabase
    .from('notes')
    .select('*')
    .eq('store_id', id)
    .order('created_at', { ascending: false })

  setNotes(data || [])
}

// In JSX
<Dialog open={isNoteDialogOpen} onOpenChange={setIsNoteDialogOpen}>
  <DialogTrigger asChild>
    <Button>Add Note</Button>
  </DialogTrigger>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Add Note</DialogTitle>
    </DialogHeader>
    <NoteForm
      storeId={id}
      onSuccess={() => {
        setIsNoteDialogOpen(false)
        fetchNotes()
      }}
      onCancel={() => setIsNoteDialogOpen(false)}
    />
  </DialogContent>
</Dialog>

{/* Display notes */}
<div className="space-y-4">
  {notes.map(note => (
    <div key={note.id} className="border p-4 rounded-lg">
      <p>{note.content}</p>
      <p className="text-sm text-muted-foreground mt-2">
        {new Date(note.created_at).toLocaleString()}
      </p>
    </div>
  ))}
</div>
```

---

### Task 4: Add a New Filter/Search

**Example: Filter stores by region**

```typescript
const [selectedRegion, setSelectedRegion] = useState<string>('all')
const [regions, setRegions] = useState<any[]>([])

useEffect(() => {
  async function fetchRegions() {
    const { data } = await supabase.from('regions').select('*').order('name')
    setRegions(data || [])
  }
  fetchRegions()
}, [])

const fetchStores = async () => {
  let query = supabase.from('stores').select('*')

  if (selectedRegion !== 'all') {
    query = query.eq('region', selectedRegion)
  }

  const { data } = await query.order('name')
  setStores(data || [])
}

useEffect(() => {
  fetchStores()
}, [selectedRegion])

// In JSX
<Select value={selectedRegion} onValueChange={setSelectedRegion}>
  <SelectTrigger className="w-[200px]">
    <SelectValue placeholder="All regions" />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="all">All Regions</SelectItem>
    {regions.map(region => (
      <SelectItem key={region.id} value={region.name}>
        {region.name}
      </SelectItem>
    ))}
  </SelectContent>
</Select>
```

---

### Task 5: Add Validation

**Example: Validate store form**

```typescript
const validateForm = () => {
  if (!formData.name.trim()) {
    toast.error("Store name is required")
    return false
  }

  if (!formData.address.trim()) {
    toast.error("Address is required")
    return false
  }

  if (!formData.lat || !formData.lng) {
    toast.error("Please verify location on map")
    return false
  }

  return true
}

const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault()

  if (!validateForm()) return

  // Proceed with save
}
```

---

## Common Pitfalls

### Pitfall 1: Forgetting "use client" Directive

**Problem**: Component uses hooks but missing `"use client"`

**Error**: `You're importing a component that needs useState. This only works in a Client Component`

**Solution**: Add `"use client"` at top of file:
```typescript
"use client"

import { useState } from "react"
// ... rest of component
```

---

### Pitfall 2: Not Handling Loading States

**Problem**: Component renders before data loads, causes errors

**Bad**:
```typescript
export default function Page() {
  const [data, setData] = useState<any[]>([])

  useEffect(() => { fetchData() }, [])

  return <div>{data[0].name}</div> // ❌ Error if data is empty
}
```

**Good**:
```typescript
export default function Page() {
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetch() {
      setLoading(true)
      // fetch data
      setLoading(false)
    }
    fetch()
  }, [])

  if (loading) return <div>Loading...</div>
  if (!data.length) return <div>No data</div>

  return <div>{data[0].name}</div> // ✅ Safe
}
```

---

### Pitfall 3: Not Refreshing Data After Mutations

**Problem**: Create/update succeeds but list doesn't refresh

**Solution**: Call fetch function after successful mutation:
```typescript
const handleCreate = async () => {
  await supabase.from('stores').insert(...)
  toast.success("Created!")

  fetchStores() // ✅ Refresh the list
  setIsDialogOpen(false)
}
```

---

### Pitfall 4: Incorrect Supabase Query Syntax

**Problem**: Trying to use SQL-style syntax in Supabase queries

**Bad**:
```typescript
const { data } = await supabase
  .from('stores')
  .select('*, assets.*') // ❌ Wrong syntax
```

**Good**:
```typescript
const { data } = await supabase
  .from('stores')
  .select(`
    *,
    assets (*)
  `) // ✅ Correct nested select
```

---

### Pitfall 5: Not Handling Enum Types

**Problem**: Trying to insert string into ENUM column

**Bad**:
```typescript
await supabase
  .from('stores')
  .insert({ status: 'active' }) // ❌ Type error if not cast
```

**Good**:
```typescript
await supabase
  .from('stores')
  .insert({ status: 'active'::store_status }) // ✅ In SQL

// Or in TypeScript, just use the string (Supabase handles it)
await supabase
  .from('stores')
  .insert({ status: 'active' }) // ✅ Usually works
```

---

### Pitfall 6: Missing Error Handling

**Problem**: Errors fail silently

**Bad**:
```typescript
const { data } = await supabase.from('stores').select('*')
setStores(data)
```

**Good**:
```typescript
const { data, error } = await supabase.from('stores').select('*')

if (error) {
  console.error('Error fetching stores:', error)
  toast.error(error.message)
  return
}

setStores(data || [])
```

---

### Pitfall 7: Not Using Dynamic Imports for Leaflet

**Problem**: Leaflet breaks during SSR

**Bad**:
```typescript
import { MapContainer } from 'react-leaflet' // ❌ SSR error
```

**Good**:
```typescript
const MapContainer = dynamic(
  () => import('react-leaflet').then(mod => mod.MapContainer),
  { ssr: false } // ✅ Disable SSR
)
```

---

### Pitfall 8: Hardcoding Client IDs

**Problem**: Manually filtering by client_id

**Bad**:
```typescript
const { data } = await supabase
  .from('stores')
  .select('*')
  .eq('client_id', 'hardcoded-uuid') // ❌ Don't do this
```

**Good**:
```typescript
const { data } = await supabase
  .from('stores')
  .select('*')
// ✅ RLS handles client_id filtering automatically
```

---

## Testing & Deployment

### Development

```bash
npm run dev
```
**URL**: http://localhost:3000

### Build

```bash
npm run build
```
**Checks**: TypeScript types, ESLint, Next.js build

### Lint

```bash
npm run lint
```

### Environment Variables

**Required**:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

**Vercel Setup**:
- **Production**: Use rpm-prod Supabase credentials
- **Preview**: Use rpm-dev Supabase credentials
- **Development**: Use rpm-dev Supabase credentials

### Branch Strategy

- **main**: Production (deploys to production Vercel)
- **dev**: Staging (deploys to preview Vercel)
- **feature/***: Feature branches (PR to dev)

### Deployment Checklist

1. ✅ Create feature branch off `dev`
2. ✅ Implement feature following patterns in this guide
3. ✅ Test locally with `npm run dev`
4. ✅ Run `npm run build` to check for errors
5. ✅ Push branch and create PR to `dev`
6. ✅ Vercel creates preview deployment
7. ✅ Test preview deployment
8. ✅ Merge to `dev`
9. ✅ Test staging deployment
10. ✅ Create PR from `dev` to `main`
11. ✅ Merge to `main` for production

---

## Quick Reference Cheatsheet

### File Locations
- Pages: `/src/app/**./page.tsx`
- Components: `/src/components/*.tsx`
- Supabase client: `/src/lib/supabase/client.ts`
- Migrations: `/supabase/migrations/*.sql`

### Common Commands
```bash
npm run dev          # Start dev server
npm run build        # Build for production
npm run lint         # Run ESLint
npx tsx scripts/*.ts # Run TypeScript scripts
```

### Common Imports
```typescript
"use client"
import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import DashboardLayout from "@/components/dashboard-layout"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
```

### Standard Component Template
```typescript
"use client"

import { useEffect, useState } from "react"
import DashboardLayout from "@/components/dashboard-layout"
import { createClient } from "@/lib/supabase/client"

export default function PageName() {
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    async function fetch() {
      setLoading(true)
      const { data } = await supabase.from('table').select('*')
      setData(data || [])
      setLoading(false)
    }
    fetch()
  }, [])

  if (loading) return <DashboardLayout><div>Loading...</div></DashboardLayout>

  return (
    <DashboardLayout>
      {/* Content */}
    </DashboardLayout>
  )
}
```

---

## Final Notes for AI Agents

1. **Always use `"use client"`** at the top of every component file
2. **Always wrap pages in `<DashboardLayout>`**
3. **Always handle loading and error states**
4. **Always use the Supabase client from `/src/lib/supabase/client.ts`**
5. **Always refresh data after mutations** (call fetch function)
6. **Always use shadcn/ui components** (don't create custom buttons, inputs, etc.)
7. **Always use toast notifications** for user feedback (`toast.success()`, `toast.error()`)
8. **Never hardcode client IDs** (RLS handles it)
9. **Never use API routes** (direct Supabase queries only)
10. **Never forget to add new pages to sidebar** (`app-sidebar.tsx`)

---

**End of CLAUDE.md**

This guide should enable you to implement features correctly without human guidance. Follow the patterns, avoid the pitfalls, and test thoroughly. Good luck!
