import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

/**
 * Renders a component the way the real app does for anything using TanStack Query and
 * react-router-dom hooks (useSearchParams, useNavigate, ...), without needing the full <App />.
 * A fresh QueryClient per render keeps tests from leaking cached data into one another.
 */
export function renderWithProviders(ui, { route = '/', retry = false } = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry }, mutations: { retry } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  )
}
