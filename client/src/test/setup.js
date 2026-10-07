import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { MotionGlobalConfig } from 'motion/react'

MotionGlobalConfig.skipAnimations = true

afterEach(cleanup)

URL.createObjectURL ??= () => 'blob:test'
URL.revokeObjectURL ??= () => {}
