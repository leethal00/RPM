import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import GlobalError from '../error'

describe('GlobalError', () => {
  it('renders error message and try again button', () => {
    const reset = vi.fn()
    const error = new Error('Test error')

    render(<GlobalError error={error} reset={reset} />)

    expect(screen.getByText('Something went wrong')).toBeInTheDocument()
    expect(screen.getByText('An unexpected error occurred. Please try again.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })

  it('calls reset when try again is clicked', () => {
    const reset = vi.fn()
    const error = new Error('Test error')

    render(<GlobalError error={error} reset={reset} />)

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(reset).toHaveBeenCalledOnce()
  })
})
