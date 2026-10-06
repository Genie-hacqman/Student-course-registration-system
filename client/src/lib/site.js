/**
 * Public facts about the institution, set per deployment through VITE_* variables (see .env.example) so real
 * contact details never live in the source. Anything left blank is simply not shown, never replaced by a placeholder.
 */
const env = import.meta.env

const clean = (value) => (typeof value === 'string' ? value.trim() : '')

export const SITE = {
  /** Public origin of the frontend, without a trailing slash. Used by the sitemap and share tags at build time. */
  url: clean(env.VITE_SITE_URL).replace(/\/+$/, ''),
  institution: clean(env.VITE_INSTITUTION_NAME) || 'the institution',
  email: clean(env.VITE_SUPPORT_EMAIL),
  phone: clean(env.VITE_SUPPORT_PHONE),
  address: clean(env.VITE_SUPPORT_ADDRESS),
}

/** True when at least one way to reach the registry is configured. */
export const hasContact = Boolean(SITE.email || SITE.phone || SITE.address)

/** `tel:` links want digits and a leading plus only. */
export const telHref = (phone) => `tel:${phone.replace(/[^\d+]/g, '')}`
