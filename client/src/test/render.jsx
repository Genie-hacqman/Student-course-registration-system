import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { MotionProvider } from '../lib/motionPresets'

export function renderWithProviders(ui, { route = '/', retry = false } = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry }, mutations: { retry } },
  })
  return render(
    <MotionProvider>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
      </QueryClientProvider>
    </MotionProvider>,
  )
}
