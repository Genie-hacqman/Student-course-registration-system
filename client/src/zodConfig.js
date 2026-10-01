import { z } from 'zod'

// The site's CSP forbids eval; without this zod probes `new Function` and the browser reports a violation.
z.config({ jitless: true })
