import { describe, it, expect } from 'vitest'
import type { Store, Job, JobStatus, Severity } from '../database'

describe('Database types', () => {
  it('JobStatus accepts valid values', () => {
    const statuses: JobStatus[] = ['open', 'in_progress', 'resolved', 'closed']
    expect(statuses).toHaveLength(4)
  })

  it('Severity accepts valid values', () => {
    const severities: Severity[] = ['low', 'medium', 'high', 'critical']
    expect(severities).toHaveLength(4)
  })

  it('Store type has required fields', () => {
    const store: Store = {
      id: 'test-id',
      client_id: 'client-id',
      name: 'Test Store',
      region: 'Auckland',
      address: '123 Main St',
      lat: -36.8485,
      lng: 174.7633,
      manager_name: null,
      manager_phone: null,
      rodier_account_manager_id: null,
      status: 'active',
      brand_st_pierres: true,
      brand_bento_bowl: false,
      brand_k10: false,
      site_type: null,
      site_category: 'Stand alone',
      maintenance_score: null,
      hours_of_operation: null,
      has_drive_thru: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    expect(store.name).toBe('Test Store')
    expect(store.status).toBe('active')
  })

  it('Job type has required fields', () => {
    const job: Job = {
      id: 'job-id',
      store_id: 'store-id',
      asset_id: null,
      vendor_id: null,
      project_id: null,
      job_type: 'fault',
      title: 'Broken sign',
      description: 'The pylon sign is not lit',
      severity: 'high',
      status: 'open',
      reported_by: 'user-id',
      assigned_to: null,
      resolved_at: null,
      responded_at: null,
      budget_impact: null,
      photos: [],
      media_urls: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    expect(job.job_type).toBe('fault')
    expect(job.status).toBe('open')
  })
})
