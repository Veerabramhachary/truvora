// src/db/utils/encryption.ts
import {
    createCipheriv,
    createDecipheriv,
    randomBytes,
    scryptSync,
} from "node:crypto";

// Use a fixed salt for key derivation (store in env or config). Better: generate per record salt?
const ALGORITHM = "aes-256-gcm"; // Authenticated encryption
const IV_LENGTH = 12; // Recommended for GCM
const AUTH_TAG_LENGTH = 16;

// Derive a 32-byte key from a passphrase using scrypt
function deriveKey(passphrase: string, salt: string): Buffer {
    // Use scrypt with appropriate parameters (cost, blockSize, parallelization)
    return scryptSync(passphrase, salt, 32, { N: 2 ** 14, r: 8, p: 1 });
}

// The key is derived lazily and cached. Deriving it at module load made every
// importer (including `drizzle-kit`, which loads the schema to generate
// migrations) fail with an opaque crypto error when the env var was missing,
// and burned ~100ms of blocking CPU on every cold start.
let cachedKey: Buffer | null = null;

function getEncryptionKey(): Buffer {
    if (cachedKey) return cachedKey;

    const passphrase = process.env.ENCRYPTION_PASSPHRASE;
    const salt = process.env.ENCRYPTION_SALT;

    if (!passphrase || !salt) {
        throw new Error(
            "Encryption is not configured: ENCRYPTION_PASSPHRASE and ENCRYPTION_SALT must be set",
        );
    }

    cachedKey = deriveKey(passphrase, salt);
    return cachedKey;
}

export interface EncryptedData {
    iv: string; // hex
    ciphertext: string; // hex
    authTag: string; // hex
}

/**
 * The format written by `encrypt`.  Keeping this check separate lets column
 * readers distinguish legacy plaintext rows from ciphertext before trying to
 * decrypt them.  An empty ciphertext is valid: it represents an encrypted
 * empty string.
 */
export function isEncryptedData(value: string): boolean {
    const parts = value.split(":");
    if (parts.length !== 3) return false;

    const [ivHex, ciphertextHex, authTagHex] = parts;
    return (
        /^[0-9a-f]{24}$/i.test(ivHex) &&
        /^[0-9a-f]*$/i.test(ciphertextHex) &&
        ciphertextHex.length % 2 === 0 &&
        /^[0-9a-f]{32}$/i.test(authTagHex)
    );
}

export function encrypt(text: string): string {
    // Resolved outside the try so a missing configuration surfaces with its
    // own message instead of being masked as "Encryption error".
    const key = getEncryptionKey();
    try {
        const iv = randomBytes(IV_LENGTH);
        const cipher = createCipheriv(ALGORITHM, key, iv, {
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
    const key = getEncryptionKey();
    try {
        if (!isEncryptedData(encryptedString)) {
            throw new Error("Invalid encrypted data format");
        }
        const [ivHex, ciphertextHex, authTagHex] = encryptedString.split(":");
        const iv = Buffer.from(ivHex, "hex");
        const ciphertext = Buffer.from(ciphertextHex, "hex");
        const authTag = Buffer.from(authTagHex, "hex");
        const decipher = createDecipheriv(ALGORITHM, key, iv, {
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
