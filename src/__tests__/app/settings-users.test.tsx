import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Mock next-themes
const mockSetTheme = vi.fn()
let mockTheme = 'light'

vi.mock('next-themes', () => ({
  useTheme: () => ({
    theme: mockTheme,
    setTheme: mockSetTheme,
  }),
}))

// Mock DashboardLayout
vi.mock('@/components/dashboard-layout', () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="layout">{children}</div>
  ),
}))

// Mock UserManager
vi.mock('@/components/user-manager', () => ({
  UserManager: () => <div data-testid="user-manager">UserManager</div>,
}))

import UsersPage from '@/app/settings/users/page'

describe('Settings UsersPage — Appearance section', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockTheme = 'light'
  })

  it('should render the Portal Settings heading', () => {
    render(<UsersPage />)

    expect(screen.getByText('Portal Settings')).toBeInTheDocument()
  })

  it('should render Appearance card with theme label', () => {
    render(<UsersPage />)

    expect(screen.getByText('Appearance')).toBeInTheDocument()
    expect(screen.getByText('Customize how RPM looks for you.')).toBeInTheDocument()
    expect(screen.getByText('Theme')).toBeInTheDocument()
  })

  it('should render Light and Dark theme buttons', () => {
    render(<UsersPage />)

    expect(screen.getByRole('button', { name: /light/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /dark/i })).toBeInTheDocument()
  })

  it('should call setTheme("dark") when Dark button is clicked', async () => {
    const user = userEvent.setup()
    mockTheme = 'light'

    render(<UsersPage />)

    await user.click(screen.getByRole('button', { name: /dark/i }))
    expect(mockSetTheme).toHaveBeenCalledWith('dark')
  })

  it('should call setTheme("light") when Light button is clicked', async () => {
    const user = userEvent.setup()
    mockTheme = 'dark'

    render(<UsersPage />)

    await user.click(screen.getByRole('button', { name: /light/i }))
    expect(mockSetTheme).toHaveBeenCalledWith('light')
  })

  it('should render the UserManager component', () => {
    render(<UsersPage />)

    expect(screen.getByTestId('user-manager')).toBeInTheDocument()
  })

  it('should be wrapped in DashboardLayout', () => {
    render(<UsersPage />)

    expect(screen.getByTestId('layout')).toBeInTheDocument()
  })
})
