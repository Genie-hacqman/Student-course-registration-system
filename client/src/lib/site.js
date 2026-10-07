const env = import.meta.env

const clean = (value) => (typeof value === 'string' ? value.trim() : '')

export const SITE = {
  url: clean(env.VITE_SITE_URL).replace(/\/+$/, ''),
  institution: clean(env.VITE_INSTITUTION_NAME) || 'the institution',
  email: clean(env.VITE_SUPPORT_EMAIL),
  phone: clean(env.VITE_SUPPORT_PHONE),
  address: clean(env.VITE_SUPPORT_ADDRESS),
}

export const hasContact = Boolean(SITE.email || SITE.phone || SITE.address)

export const telHref = (phone) => `tel:${phone.replace(/[^\d+]/g, '')}`
