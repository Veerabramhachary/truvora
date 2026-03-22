import { getRequestConfig } from "next-intl/server";
import { locales, defaultLocale } from "./config";

export default getRequestConfig(async ({ locale }) => {
  const currentLocale =
    locale && locales.includes(locale as any) ? locale : defaultLocale;

  return {
    locale: currentLocale,
    messages: (await import(`@/i18n/messages/${currentLocale}.json`)).default
  };
});