import { customType } from "drizzle-orm/pg-core";
import { encrypt, decrypt } from "../utils/encryption";

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
        return decrypt(value);
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
