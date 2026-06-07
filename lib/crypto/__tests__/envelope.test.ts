import { randomBytes } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  decryptProviderKey,
  encryptProviderKey,
  type EncryptedEnvelope,
} from "@/lib/crypto/envelope";

/**
 * Envelope encryption unit tests (no DB, no network).
 *
 * A DETERMINISTIC, OBVIOUSLY-FAKE 64-hex test KEK is injected for the duration
 * of the suite and the prior value is restored afterwards. This is a test
 * constant (all `ab` bytes), NOT a real secret — the real KEK lives in the
 * user's env and is never committed. The plaintext keys used here are equally
 * fake.
 */

// 32 bytes (64 hex chars) of a fixed, non-secret pattern.
const TEST_KEK = "ab".repeat(32);
// A SECOND, different fake KEK to prove a wrong KEK fails the auth tag.
const OTHER_KEK = "cd".repeat(32);

let priorKek: string | undefined;

beforeAll(() => {
  priorKek = process.env.AI_KEY_KEK;
  process.env.AI_KEY_KEK = TEST_KEK;
});

afterAll(() => {
  if (priorKek === undefined) {
    delete process.env.AI_KEY_KEK;
  } else {
    process.env.AI_KEY_KEK = priorKek;
  }
});

describe("envelope encryption", () => {
  it("roundtrip preserves the plaintext key", () => {
    const key = "sk-test-fake-api-key-1234567890";
    const env = encryptProviderKey(key);
    expect(decryptProviderKey(env)).toBe(key);
  });

  it("100 random roundtrips never collide or fail", () => {
    for (let i = 0; i < 100; i++) {
      const key = `sk-${randomBytes(32).toString("hex")}`;
      const env = encryptProviderKey(key);
      expect(decryptProviderKey(env)).toBe(key);
    }
  });

  it("tampered ciphertext fails the GCM auth tag", () => {
    const env = encryptProviderKey("sk-test-key");
    const tampered = Buffer.from(env.encryptedKey, "base64");
    tampered[0] ^= 0xff; // flip a byte
    const corrupted: EncryptedEnvelope = {
      ...env,
      encryptedKey: tampered.toString("base64"),
    };
    expect(() => decryptProviderKey(corrupted)).toThrow();
  });

  it("decrypting with a different KEK fails the auth tag", () => {
    const key = "sk-wrong-kek-roundtrip";
    const env = encryptProviderKey(key);

    // Re-encrypt context is not possible across KEKs, so swap the KEK and
    // attempt to decrypt the DEK envelope produced under TEST_KEK.
    process.env.AI_KEY_KEK = OTHER_KEK;
    try {
      expect(() => decryptProviderKey(env)).toThrow();
    } finally {
      process.env.AI_KEY_KEK = TEST_KEK;
    }
  });

  it("missing KEK throws a clear /AI_KEY_KEK/ error", () => {
    const saved = process.env.AI_KEY_KEK;
    delete process.env.AI_KEY_KEK;
    try {
      expect(() => encryptProviderKey("sk-test")).toThrow(/AI_KEY_KEK/);
    } finally {
      process.env.AI_KEY_KEK = saved;
    }
  });

  it("invalid (non-64-hex) KEK throws a clear /AI_KEY_KEK/ error", () => {
    const saved = process.env.AI_KEY_KEK;
    process.env.AI_KEY_KEK = "tooshort";
    try {
      expect(() => encryptProviderKey("sk-test")).toThrow(/AI_KEY_KEK/);
    } finally {
      process.env.AI_KEY_KEK = saved;
    }
  });
});
