import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// Vitest has no global afterEach unless `globals` is on, so Testing Library cannot
// unmount between tests by itself; without this, rendered components pile up.
afterEach(() => cleanup())
