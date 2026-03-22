import { customType } from "drizzle-orm/pg-core";
import { encrypt, decrypt } from "../utils/encryption";


export const encryptedText = customType<{data: string | null} >({
    dataType() {
        return 'text';
    },
    toDriver(value: string | null): string | null {
        if (value === null) return null;
        return encrypt(value);
    },
    fromDriver(value: unknown): string | null {
        if (value === null) return null;
        if (typeof value !== 'string') {
            throw new Error('Expected string from database')
        }
        return decrypt(value);
    
    },
})