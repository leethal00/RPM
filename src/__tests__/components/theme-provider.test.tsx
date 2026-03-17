import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

// Mock next-themes ThemeProvider
vi.mock('next-themes', () => ({
  ThemeProvider: ({ children, ...props }: any) => (
    <div data-testid="next-themes-provider" data-props={JSON.stringify(props)}>
      {children}
    </div>
  ),
}))

import { ThemeProvider } from '@/components/theme-provider'

describe('ThemeProvider', () => {
  it('should render children', () => {
    render(
      <ThemeProvider attribute="class" defaultTheme="light">
        <div data-testid="child">Hello</div>
      </ThemeProvider>
    )

    expect(screen.getByTestId('child')).toBeInTheDocument()
    expect(screen.getByText('Hello')).toBeInTheDocument()
  })

  it('should pass props through to NextThemesProvider', () => {
    render(
      <ThemeProvider
        attribute="class"
        defaultTheme="light"
        enableSystem={false}
        disableTransitionOnChange
      >
        <span>content</span>
      </ThemeProvider>
    )

    const provider = screen.getByTestId('next-themes-provider')
    const props = JSON.parse(provider.getAttribute('data-props')!)

    expect(props.attribute).toBe('class')
    expect(props.defaultTheme).toBe('light')
    expect(props.enableSystem).toBe(false)
    expect(props.disableTransitionOnChange).toBe(true)
  })
})
