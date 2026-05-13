import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Skeleton } from '../../src/core/ui/Skeleton'

describe('Skeleton', () => {
  it('renders with pulse class', () => {
    render(<Skeleton data-testid="sk" className="h-8 w-full" />)
    const el = screen.getByTestId('sk')
    expect(el.className).toContain('animate-pulse')
  })
})
