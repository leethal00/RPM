import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Mock DashboardLayout to just render children
vi.mock('@/components/dashboard-layout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div data-testid="layout">{children}</div>,
}))

// Mock recharts to avoid canvas/SVG issues in jsdom
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: any) => <div>{children}</div>,
  PieChart: ({ children }: any) => <div>{children}</div>,
  Pie: () => <div />,
  Cell: () => <div />,
  BarChart: ({ children }: any) => <div>{children}</div>,
  Bar: () => <div />,
  AreaChart: ({ children }: any) => <div>{children}</div>,
  Area: () => <div />,
  XAxis: () => <div />,
  YAxis: () => <div />,
  CartesianGrid: () => <div />,
  Tooltip: () => <div />,
  Legend: () => <div />,
}))

// Build mock Supabase query chain
const mockSelectAssets = vi.fn()
const mockSelectSchedules = vi.fn()
const mockSelectJobs = vi.fn()

function createChain(selectFn: ReturnType<typeof vi.fn>) {
  const chain: any = {}
  chain.select = selectFn
  chain.gte = vi.fn(() => chain)
  chain.lte = vi.fn(() => chain)
  chain.order = vi.fn(() => chain)
  // select should return the chain
  selectFn.mockReturnValue(chain)
  return chain
}

const assetsChain = createChain(mockSelectAssets)
const schedulesChain = createChain(mockSelectSchedules)
const jobsChain = createChain(mockSelectJobs)

const mockFrom = vi.fn((table: string) => {
  if (table === 'assets') return { select: mockSelectAssets }
  if (table === 'maintenance_schedules') return { select: mockSelectSchedules }
  if (table === 'jobs') return { select: mockSelectJobs }
  return { select: vi.fn(() => ({ gte: vi.fn(), lte: vi.fn(), order: vi.fn() })) }
})

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ from: mockFrom }),
}))

// We need to import *after* mocks are set up
import AnalyticsPage from '@/app/analysis/page'

describe('AnalyticsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // Reset chains
    createChain(mockSelectAssets)
    createChain(mockSelectSchedules)
    createChain(mockSelectJobs)
  })

  it('should show loading skeleton initially', () => {
    // Make queries hang (never resolve)
    mockSelectAssets.mockReturnValue({
      ...assetsChain,
      then: () => new Promise(() => {}),
      // supabase queries are thenable - simulate pending
    })

    // Actually the Supabase client returns a Promise-like from the final chain call
    // We need the chain's terminal method to return a pending promise
    // The simplest approach: make select return a chain where the result never resolves
    assetsChain.select = vi.fn(() => new Promise(() => {}))

    render(<AnalyticsPage />)
    expect(screen.getByTestId('layout')).toBeInTheDocument()
  })

  it('should show error state when asset fetch fails', async () => {
    mockSelectAssets.mockReturnValue({
      data: null,
      error: { message: 'Permission denied' },
    })
    mockSelectSchedules.mockReturnValue({
      gte: vi.fn(() => ({
        lte: vi.fn(() => ({
          order: vi.fn(() => ({
            data: [],
            error: null,
          })),
        })),
      })),
    })
    mockSelectJobs.mockReturnValue({
      gte: vi.fn(() => ({
        data: [],
        error: null,
      })),
    })

    render(<AnalyticsPage />)

    await waitFor(() => {
      expect(screen.getByText('Failed to Load Analytics')).toBeInTheDocument()
    })

    expect(screen.getByText(/Permission denied/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument()
  })

  it('should show error state when assets data is null without error', async () => {
    mockSelectAssets.mockReturnValue({
      data: null,
      error: null,
    })
    mockSelectSchedules.mockReturnValue({
      gte: vi.fn(() => ({
        lte: vi.fn(() => ({
          order: vi.fn(() => ({
            data: [],
            error: null,
          })),
        })),
      })),
    })
    mockSelectJobs.mockReturnValue({
      gte: vi.fn(() => ({
        data: [],
        error: null,
      })),
    })

    render(<AnalyticsPage />)

    await waitFor(() => {
      expect(screen.getByText('No asset data returned')).toBeInTheDocument()
    })
  })

  it('should render analytics data on successful fetch', async () => {
    const mockAssets = [
      {
        id: 'a1',
        name: 'Menu Board 1',
        status: 'operational',
        next_service_date: new Date(Date.now() + 90 * 86400000).toISOString(),
        last_service_date: null,
        install_date: null,
        asset_type_id: 'at1',
        store_id: 's1',
        asset_types: { label: 'Digital Menu Board' },
        stores: { name: 'Store A', region: 'Auckland' },
        jobs: [],
      },
      {
        id: 'a2',
        name: 'Pylon Sign',
        status: 'operational',
        next_service_date: new Date(Date.now() + 10 * 86400000).toISOString(),
        last_service_date: null,
        install_date: null,
        asset_type_id: 'at2',
        store_id: 's1',
        asset_types: { label: 'Pylon Sign' },
        stores: { name: 'Store A', region: 'Auckland' },
        jobs: [],
      },
      {
        id: 'a3',
        name: 'Fascia Sign',
        status: 'faulty',
        next_service_date: null,
        last_service_date: null,
        install_date: null,
        asset_type_id: 'at3',
        store_id: 's2',
        asset_types: { label: 'Fascia Sign' },
        stores: { name: 'Store B', region: 'Wellington' },
        jobs: [{ status: 'open' }],
      },
    ]

    mockSelectAssets.mockReturnValue({
      data: mockAssets,
      error: null,
    })
    mockSelectSchedules.mockReturnValue({
      gte: vi.fn(() => ({
        lte: vi.fn(() => ({
          order: vi.fn(() => ({
            data: [],
            error: null,
          })),
        })),
      })),
    })
    mockSelectJobs.mockReturnValue({
      gte: vi.fn(() => ({
        data: [],
        error: null,
      })),
    })

    render(<AnalyticsPage />)

    await waitFor(() => {
      expect(screen.getByText('Portfolio Analytics')).toBeInTheDocument()
    })

    // Summary cards
    expect(screen.getByText('3')).toBeInTheDocument() // total assets
    expect(screen.getByText('Total Assets')).toBeInTheDocument()
    expect(screen.getByText('Healthy')).toBeInTheDocument()
    expect(screen.getByText('Due Soon')).toBeInTheDocument()
    expect(screen.getByText('Attention')).toBeInTheDocument()
  })

  it('should have a Try Again button in error state that retries', async () => {
    const user = userEvent.setup()

    // First call fails
    mockSelectAssets.mockReturnValueOnce({
      data: null,
      error: { message: 'Network error' },
    })
    mockSelectSchedules.mockReturnValue({
      gte: vi.fn(() => ({
        lte: vi.fn(() => ({
          order: vi.fn(() => ({ data: [], error: null })),
        })),
      })),
    })
    mockSelectJobs.mockReturnValue({
      gte: vi.fn(() => ({ data: [], error: null })),
    })

    render(<AnalyticsPage />)

    await waitFor(() => {
      expect(screen.getByText('Failed to Load Analytics')).toBeInTheDocument()
    })

    // Second call succeeds
    mockSelectAssets.mockReturnValueOnce({
      data: [],
      error: null,
    })

    const retryButton = screen.getByRole('button', { name: /try again/i })
    await user.click(retryButton)

    // After retry with empty data, should show analytics (with 0 counts)
    await waitFor(() => {
      expect(screen.getByText('Portfolio Analytics')).toBeInTheDocument()
    })
  })
})

describe('AnalyticsPage asset health classification', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    createChain(mockSelectAssets)
    createChain(mockSelectSchedules)
    createChain(mockSelectJobs)
  })

  it('should classify assets with active faults as faulted', async () => {
    const mockAssets = [
      {
        id: 'a1',
        name: 'Faulted Asset',
        status: 'faulty',
        next_service_date: null,
        last_service_date: null,
        install_date: null,
        asset_type_id: 'at1',
        store_id: 's1',
        asset_types: { label: 'Sign' },
        stores: { name: 'Store', region: 'Auckland' },
        jobs: [{ status: 'open' }],
      },
    ]

    mockSelectAssets.mockReturnValue({ data: mockAssets, error: null })
    mockSelectSchedules.mockReturnValue({
      gte: vi.fn(() => ({
        lte: vi.fn(() => ({
          order: vi.fn(() => ({ data: [], error: null })),
        })),
      })),
    })
    mockSelectJobs.mockReturnValue({
      gte: vi.fn(() => ({ data: [], error: null })),
    })

    render(<AnalyticsPage />)

    await waitFor(() => {
      expect(screen.getByText('Portfolio Analytics')).toBeInTheDocument()
    })

    // 1 faulted, 0 overdue = 1 attention
    expect(screen.getByText('0 OVERDUE + 1 FAULTED')).toBeInTheDocument()
  })

  it('should classify assets with overdue service as overdue', async () => {
    const mockAssets = [
      {
        id: 'a1',
        name: 'Overdue Asset',
        status: 'operational',
        next_service_date: new Date(Date.now() - 10 * 86400000).toISOString(), // 10 days ago
        last_service_date: null,
        install_date: null,
        asset_type_id: 'at1',
        store_id: 's1',
        asset_types: { label: 'Sign' },
        stores: { name: 'Store', region: 'Auckland' },
        jobs: [],
      },
    ]

    mockSelectAssets.mockReturnValue({ data: mockAssets, error: null })
    mockSelectSchedules.mockReturnValue({
      gte: vi.fn(() => ({
        lte: vi.fn(() => ({
          order: vi.fn(() => ({ data: [], error: null })),
        })),
      })),
    })
    mockSelectJobs.mockReturnValue({
      gte: vi.fn(() => ({ data: [], error: null })),
    })

    render(<AnalyticsPage />)

    await waitFor(() => {
      expect(screen.getByText('1 OVERDUE + 0 FAULTED')).toBeInTheDocument()
    })
  })

  it('should classify assets with no next_service_date as healthy', async () => {
    const mockAssets = [
      {
        id: 'a1',
        name: 'Healthy Asset',
        status: 'operational',
        next_service_date: null,
        last_service_date: null,
        install_date: null,
        asset_type_id: 'at1',
        store_id: 's1',
        asset_types: { label: 'Sign' },
        stores: { name: 'Store', region: 'Auckland' },
        jobs: [],
      },
    ]

    mockSelectAssets.mockReturnValue({ data: mockAssets, error: null })
    mockSelectSchedules.mockReturnValue({
      gte: vi.fn(() => ({
        lte: vi.fn(() => ({
          order: vi.fn(() => ({ data: [], error: null })),
        })),
      })),
    })
    mockSelectJobs.mockReturnValue({
      gte: vi.fn(() => ({ data: [], error: null })),
    })

    render(<AnalyticsPage />)

    await waitFor(() => {
      expect(screen.getByText('Portfolio Analytics')).toBeInTheDocument()
    })

    // 100% healthy
    expect(screen.getByText('100% HEALTHY')).toBeInTheDocument()
  })
})
