import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";

/**
 * Envelope encryption (AES-256-GCM) for BYO provider keys · F7.
 *
 * DEK + KEK pattern:
 * - DEK (Data Encryption Key): a unique random 256-bit key per encrypted API
 *   key. Stored (encrypted) alongside the ciphertext.
 * - KEK (Key Encryption Key): the product master key (256-bit) living ONLY in
 *   the `AI_KEY_KEK` env var. Never persisted, never logged.
 *
 * Why envelope over direct encryption:
 * - Rotating the KEK only re-encrypts the 32-byte DEKs, not every API key.
 * - The encrypted DEK lives in the DB next to the ciphertext; the KEK stays in
 *   a protected env var, keeping the trust boundary separable.
 *
 * SECRETS HARD-STOP: the KEK and any decrypted plaintext key MUST NEVER be
 * logged, traced, or returned outside the immediate caller. `loadKek` reads the
 * env var but never echoes its value, even on error.
 */

const ALGORITHM = "aes-256-gcm";
const KEK_HEX_LENGTH = 64; // 32 bytes in hex.
const IV_LENGTH = 12; // 96-bit IV recommended for GCM.
const TAG_LENGTH = 16; // 128-bit GCM auth tag.

/**
 * Reads and validates the master KEK from `process.env.AI_KEY_KEK`.
 *
 * Throws a clear error (matching `/AI_KEY_KEK/`) when the env var is missing or
 * not exactly 64 hex chars. The KEK value itself is NEVER included in the error
 * message or any log.
 */
function loadKek(): Buffer {
  const hex = process.env.AI_KEY_KEK;
  if (!hex || hex.length !== KEK_HEX_LENGTH) {
    throw new Error(
      "AI_KEY_KEK env var missing or invalid (expected 64 hex chars)",
    );
  }
  return Buffer.from(hex, "hex");
}

/**
 * The persisted envelope for a single provider key. Maps 1:1 to the
 * `ai_provider_configs` envelope columns. All fields are base64.
 */
export type EncryptedEnvelope = {
  encryptedKey: string; // base64 — API key ciphertext.
  keyIv: string; // base64 — IV used to encrypt the key with the DEK.
  keyTag: string; // base64 — GCM auth tag for the key ciphertext.
  encryptedDek: string; // base64 — packs encryptedDekRaw || dekTag || dekIv.
};

/**
 * Encrypts a plaintext provider key under a fresh random DEK, then encrypts
 * that DEK under the KEK. Returns the base64 envelope for persistence.
 *
 * The caller MUST discard `plaintextKey` immediately after this returns. The
 * plaintext never leaves the caller's scope through this function.
 */
export function encryptProviderKey(plaintextKey: string): EncryptedEnvelope {
  const kek = loadKek();

  // 1. Generate a random DEK (256 bits).
  const dek = randomBytes(32);

  // 2. Encrypt the API key with the DEK.
  const keyIv = randomBytes(IV_LENGTH);
  const keyCipher = createCipheriv(ALGORITHM, dek, keyIv);
  const encryptedKey = Buffer.concat([
    keyCipher.update(plaintextKey, "utf8"),
    keyCipher.final(),
  ]);
  const keyTag = keyCipher.getAuthTag();

  // 3. Encrypt the DEK with the KEK.
  const dekIv = randomBytes(IV_LENGTH);
  const dekCipher = createCipheriv(ALGORITHM, kek, dekIv);
  const encryptedDekRaw = Buffer.concat([
    dekCipher.update(dek),
    dekCipher.final(),
  ]);
  const dekTag = dekCipher.getAuthTag();

  return {
    encryptedKey: encryptedKey.toString("base64"),
    keyIv: keyIv.toString("base64"),
    keyTag: keyTag.toString("base64"),
    // Pack payload + tag + iv so the encrypted DEK lives in a single column.
    encryptedDek: Buffer.concat([encryptedDekRaw, dekTag, dekIv]).toString(
      "base64",
    ),
  };
}

/**
 * Decrypts an envelope back to the plaintext provider key.
 *
 * Returns the plaintext for IMMEDIATE use (e.g. building a provider client) and
 * the caller MUST discard it without logging or persisting. A tampered
 * ciphertext or wrong KEK surfaces Node's GCM auth-tag failure unchanged so the
 * caller can map it to a curated message.
 */
export function decryptProviderKey(row: EncryptedEnvelope): string {
  const kek = loadKek();

  // 1. Unpack and decrypt the DEK (layout: encryptedDekRaw || dekTag || dekIv).
  const dekBuf = Buffer.from(row.encryptedDek, "base64");
  const dekIv = dekBuf.subarray(dekBuf.length - IV_LENGTH);
  const dekTag = dekBuf.subarray(
    dekBuf.length - IV_LENGTH - TAG_LENGTH,
    dekBuf.length - IV_LENGTH,
  );
  const encryptedDek = dekBuf.subarray(
    0,
    dekBuf.length - IV_LENGTH - TAG_LENGTH,
  );
  const dekDecipher = createDecipheriv(ALGORITHM, kek, dekIv);
  dekDecipher.setAuthTag(dekTag);
  const dek = Buffer.concat([
    dekDecipher.update(encryptedDek),
    dekDecipher.final(),
  ]);

  // 2. Decrypt the API key with the recovered DEK.
  const decipher = createDecipheriv(
    ALGORITHM,
    dek,
    Buffer.from(row.keyIv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(row.keyTag, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(row.encryptedKey, "base64")),
    decipher.final(),
  ]).toString("utf8");

  return plaintext;
}
