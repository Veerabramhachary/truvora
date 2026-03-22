// i18n/config.ts
export const locales = ['en', 'ar'] as const;
export const defaultLocale = 'en' as const;

export type Locale = (typeof locales)[number];

// Optional: pathname mapping for the middleware (if you want translated URLs)
export const pathnames = {
  '/': '/',
  '/pricing': {
    en: '/pricing',
    ar: '/الأسعار',
  }
} as const;

// Locale prefix strategy (used in middleware)
export const localePrefix = 'as-needed'; // or 'always', 'never'