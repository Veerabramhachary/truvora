import { Suspense } from "react";
import SelectProviderContent from "./SelectProviderContent";
export const dynamic = 'force-dynamic';
export default function Page() {
    return (
        <Suspense fallback={<div>Loading provider selection...</div>}>
            <SelectProviderContent />
        </Suspense>
    );
}
