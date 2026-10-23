import { customType } from "drizzle-orm/pg-core";
import { encrypt, decrypt, isEncryptedData } from "../utils/encryption";

function decryptText(value: string): string {
    if (isEncryptedData(value)) return decrypt(value);

    // Notes created before encrypted columns were introduced are plaintext.
    // Preserve them on read so one legacy row cannot make an entire list fail.
    // A colon indicates an intended encrypted payload; reject malformed data
    // instead of silently rendering a damaged ciphertext as text.
    if (!value.includes(":")) return value;
    throw new Error("Invalid encrypted data format");
}

export const encryptedText = customType<{ data: string | null }>({
    dataType() {
        return "text";
    },
    toDriver(value: string | null): string | null {
        if (value === null) return null;
        return encrypt(value);
    },
    fromDriver(value: unknown): string | null {
        if (value === null) return null;
        if (typeof value !== "string") {
            throw new Error("Expected string from database");
        }
        return decryptText(value);
    },
});

export const encryptedJson = <T>() =>
    customType<{ data: T | null }>({
        dataType() {
            return "text";
        },
        toDriver(value: T | null): string | null {
            if (value === null) return null;
            // Convert the object/array to a string before encrypting
            return encrypt(JSON.stringify(value));
        },
        fromDriver(value: unknown): T | null {
            if (value === null) return null;
            if (typeof value !== "string") {
                throw new Error("Expected encrypted string from database");
            }
            const decrypted = decrypt(value);
            // Parse the decrypted string back into a JSON object
            return JSON.parse(decrypted) as T;
        },
    });
