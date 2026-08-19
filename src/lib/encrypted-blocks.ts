export const ENCRYPTED_BLOCKS_VERSION = 1 as const;
export const PBKDF2_ITERATIONS = 600_000;

export type EncryptedBlocks = {
  version: typeof ENCRYPTED_BLOCKS_VERSION;
  algorithm: "AES-GCM";
  kdf: {
    name: "PBKDF2";
    hash: "SHA-256";
    iterations: number;
    salt: string;
  };
  iv: string;
  ciphertext: string;
};

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function assertPayload(payload: EncryptedBlocks): void {
  if (
    payload.version !== ENCRYPTED_BLOCKS_VERSION
    || payload.algorithm !== "AES-GCM"
    || payload.kdf?.name !== "PBKDF2"
    || payload.kdf.hash !== "SHA-256"
    || !Number.isSafeInteger(payload.kdf.iterations)
    || payload.kdf.iterations < 100_000
    || !payload.kdf.salt
    || !payload.iv
    || !payload.ciphertext
  ) {
    throw new Error("Unsupported encrypted block payload.");
  }
}

async function deriveKey(
  passphrase: string,
  salt: Uint8Array,
  iterations: number,
  usages: KeyUsage[],
): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    "raw",
    encoder.encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );

  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    usages,
  );
}

export async function encryptBlocks(blocks: unknown[], passphrase: string): Promise<EncryptedBlocks> {
  if (!passphrase) throw new Error("An encryption passphrase is required.");
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt, PBKDF2_ITERATIONS, ["encrypt"]);
  const plaintext = encoder.encode(JSON.stringify(blocks));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);

  return {
    version: ENCRYPTED_BLOCKS_VERSION,
    algorithm: "AES-GCM",
    kdf: {
      name: "PBKDF2",
      hash: "SHA-256",
      iterations: PBKDF2_ITERATIONS,
      salt: bytesToBase64(salt),
    },
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
  };
}

export async function decryptBlocks(payload: EncryptedBlocks, passphrase: string): Promise<unknown[]> {
  assertPayload(payload);
  if (!passphrase) throw new Error("A decryption passphrase is required.");
  const salt = base64ToBytes(payload.kdf.salt);
  const iv = base64ToBytes(payload.iv);
  const ciphertext = base64ToBytes(payload.ciphertext);
  const key = await deriveKey(passphrase, salt, payload.kdf.iterations, ["decrypt"]);
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  const parsed: unknown = JSON.parse(decoder.decode(plaintext));
  if (!Array.isArray(parsed)) throw new Error("Decrypted content is not a block array.");
  return parsed;
}
