import { useState } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ScanReviewEntries } from './scan-review-entries'
import { emptyScanReview } from '@/lib/scan-review'

describe('scanned card dated-entry controls', () => {
  it('keeps separate dates and employees when adding a second day, travel and material', () => {
    function Review() {
      const [review, setReview] = useState(emptyScanReview)
      return <><ScanReviewEntries review={review} onChange={setReview} editable/><output data-testid="review">{JSON.stringify(review)}</output></>
    }
    render(<Review/>)
    fireEvent.click(screen.getByRole('button', { name: 'Add labour' }))
    fireEvent.change(screen.getByLabelText('Work date'), { target: { value: '2026-09-22' } })
    fireEvent.change(screen.getByLabelText('Employee'), { target: { value: 'Craig' } })
    fireEvent.change(screen.getByLabelText('Hours'), { target: { value: '0.25' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add labour' }))
    fireEvent.change(screen.getAllByLabelText('Work date')[1], { target: { value: '2026-09-24' } })
    fireEvent.change(screen.getAllByLabelText('Employee')[1], { target: { value: 'Liam' } })
    fireEvent.change(screen.getAllByLabelText('Hours')[1], { target: { value: '0.5' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add travel' }))
    fireEvent.change(screen.getAllByLabelText('Work date')[2], { target: { value: '2026-09-25' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add material' }))
    fireEvent.change(screen.getByLabelText('Date used'), { target: { value: '2026-09-21' } })
    const review = JSON.parse(screen.getByTestId('review').textContent || '{}')
    expect(review.labour).toMatchObject([{ employee: 'Craig', date: '2026-09-22', hours: '0.25' }, { employee: 'Liam', date: '2026-09-24', hours: '0.5' }])
    expect(review.travel[0].date).toBe('2026-09-25')
    expect(review.materials[0].date).toBe('2026-09-21')
    fireEvent.click(screen.getByRole('button', { name: 'Remove labour 1' }))
    expect(screen.getAllByLabelText('Work date')[0]).toHaveValue('2026-09-24')
  })
})
