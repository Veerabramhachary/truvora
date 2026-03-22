// src/db/utils/encryption.ts
import {
    createCipheriv,
    createDecipheriv,
    randomBytes,
    scryptSync,
} from "node:crypto";

// Use a fixed salt for key derivation (store in env or config). Better: generate per record salt?
const KEY_SALT = process.env.ENCRYPTION_SALT!; // Must be hex string, at least 16 bytes
const ALGORITHM = "aes-256-gcm"; // Authenticated encryption
const IV_LENGTH = 12; // Recommended for GCM
const AUTH_TAG_LENGTH = 16;

// Derive a 32-byte key from a passphrase using scrypt
function deriveKey(passphrase: string, salt: string): Buffer {
    // Use scrypt with appropriate parameters (cost, blockSize, parallelization)
    return scryptSync(passphrase, salt, 32, { N: 2 ** 14, r: 8, p: 1 });
}

// Get the key once at module load (or derive per operation if salt changes)
const ENCRYPTION_KEY = deriveKey(process.env.ENCRYPTION_PASSPHRASE!, KEY_SALT);

export interface EncryptedData {
    iv: string; // hex
    ciphertext: string; // hex
    authTag: string; // hex
}

export function encrypt(text: string): string {
    try {
        const iv = randomBytes(IV_LENGTH);
        const cipher = createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv, {
            authTagLength: AUTH_TAG_LENGTH,
        });
        const encrypted = Buffer.concat([
            cipher.update(text, "utf8"),
            cipher.final(),
        ]);
        const authTag = cipher.getAuthTag();
        // Combine iv:ciphertext:authTag as hex
        return `${iv.toString("hex")}:${encrypted.toString("hex")}:${authTag.toString("hex")}`;
    } catch (error) {
        // Log error (use your logger) and rethrow a generic error
        console.error("Encryption failed:", error);
        throw new Error("Encryption error");
    }
}

export function decrypt(encryptedString: string): string {
    try {
        const [ivHex, ciphertextHex, authTagHex] = encryptedString.split(":");
        if (!ivHex || !ciphertextHex || !authTagHex) {
            throw new Error("Invalid encrypted data format");
        }
        const iv = Buffer.from(ivHex, "hex");
        const ciphertext = Buffer.from(ciphertextHex, "hex");
        const authTag = Buffer.from(authTagHex, "hex");
        const decipher = createDecipheriv(ALGORITHM, ENCRYPTION_KEY, iv, {
            authTagLength: AUTH_TAG_LENGTH,
        });
        decipher.setAuthTag(authTag);
        const decrypted = Buffer.concat([
            decipher.update(ciphertext),
            decipher.final(),
        ]);
        return decrypted.toString("utf8");
    } catch (error) {
        console.error("Decryption failed:", error);
        throw new Error("Decryption error"); // Avoid leaking details
    }
}
