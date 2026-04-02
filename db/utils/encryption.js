"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.encrypt = encrypt;
exports.decrypt = decrypt;
// src/db/utils/encryption.ts
var node_crypto_1 = require("node:crypto");
// Use a fixed salt for key derivation (store in env or config). Better: generate per record salt?
var KEY_SALT = process.env.ENCRYPTION_SALT; // Must be hex string, at least 16 bytes
var ALGORITHM = "aes-256-gcm"; // Authenticated encryption
var IV_LENGTH = 12; // Recommended for GCM
var AUTH_TAG_LENGTH = 16;
// Derive a 32-byte key from a passphrase using scrypt
function deriveKey(passphrase, salt) {
    // Use scrypt with appropriate parameters (cost, blockSize, parallelization)
    return (0, node_crypto_1.scryptSync)(passphrase, salt, 32, { N: Math.pow(2, 14), r: 8, p: 1 });
}
// Get the key once at module load (or derive per operation if salt changes)
var ENCRYPTION_KEY = deriveKey(process.env.ENCRYPTION_PASSPHRASE, KEY_SALT);
function encrypt(text) {
    try {
        var iv = (0, node_crypto_1.randomBytes)(IV_LENGTH);
        var cipher = (0, node_crypto_1.createCipheriv)(ALGORITHM, ENCRYPTION_KEY, iv, {
            authTagLength: AUTH_TAG_LENGTH,
        });
        var encrypted = Buffer.concat([
            cipher.update(text, "utf8"),
            cipher.final(),
        ]);
        var authTag = cipher.getAuthTag();
        // Combine iv:ciphertext:authTag as hex
        return "".concat(iv.toString("hex"), ":").concat(encrypted.toString("hex"), ":").concat(authTag.toString("hex"));
    }
    catch (error) {
        // Log error (use your logger) and rethrow a generic error
        console.error("Encryption failed:", error);
        throw new Error("Encryption error");
    }
}
function decrypt(encryptedString) {
    try {
        var _a = encryptedString.split(":"), ivHex = _a[0], ciphertextHex = _a[1], authTagHex = _a[2];
        if (!ivHex || !ciphertextHex || !authTagHex) {
            throw new Error("Invalid encrypted data format");
        }
        var iv = Buffer.from(ivHex, "hex");
        var ciphertext = Buffer.from(ciphertextHex, "hex");
        var authTag = Buffer.from(authTagHex, "hex");
        var decipher = (0, node_crypto_1.createDecipheriv)(ALGORITHM, ENCRYPTION_KEY, iv, {
            authTagLength: AUTH_TAG_LENGTH,
        });
        decipher.setAuthTag(authTag);
        var decrypted = Buffer.concat([
            decipher.update(ciphertext),
            decipher.final(),
        ]);
        return decrypted.toString("utf8");
    }
    catch (error) {
        console.error("Decryption failed:", error);
        throw new Error("Decryption error"); // Avoid leaking details
    }
}
