// components/LanguageSwitcher.tsx
import { usePathname, useRouter } from "@/i18n/navigation";
import { locales } from "@/i18n/config";
import { useLocale } from "next-intl";

export default function LanguageSwitcher() {
    const pathname = usePathname();
    const router = useRouter();
    const currentLocale = useLocale();

    const handleChange = (nextLocale: string) => {
        // Replace the current locale in the path with the new one
        router.replace(pathname, { locale: nextLocale });
    };

    return (
        <select
            value={currentLocale}
            onChange={(e) => handleChange(e.target.value)}
        >
            {locales.map((loc) => (
                <option key={loc} value={loc}>
                    {loc.toUpperCase()}
                </option>
            ))}
        </select>
    );
}
