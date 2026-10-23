import { customType } from "drizzle-orm/pg-core";
import {
    decrypt,
    ENCRYPTED_DATA_PREFIX,
    encrypt,
    isEncryptedData,
} from "../utils/encryption";

function decryptText(value: string): string {
    // New writes are explicitly tagged. Anything tagged but malformed must be
    // rejected rather than rendered as plaintext.
    if (value.startsWith(ENCRYPTED_DATA_PREFIX)) return decrypt(value);

    // Pre-versioned ciphertext remains readable during the transition. Other
    // untagged rows are legacy plaintext, including text such as "Lunch:
    // client"; plaintext must not be inferred from punctuation.
    if (isEncryptedData(value)) return decrypt(value);
    return value;
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
