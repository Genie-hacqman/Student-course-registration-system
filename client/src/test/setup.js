import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

// Testing Library's auto-cleanup only registers itself when it detects global test hooks. This repo
// doesn't turn on vitest's `globals: true` (component tests import describe/it/expect explicitly, like
// the rest of the codebase), so cleanup is wired up by hand instead — without it, one test's rendered
// DOM leaks into the next test in the same file.
afterEach(cleanup)
