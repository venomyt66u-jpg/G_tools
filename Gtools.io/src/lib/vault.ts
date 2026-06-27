import crypto from "node:crypto";
import { privateKeyToAccount } from "viem/accounts";
import type { Address } from "viem";

/**
 * Wallet vault.
 *
 * SECURITY MODEL (read this):
 * - This app is single-user and meant to run on YOUR machine.
 * - Private keys are encrypted at rest with AES-256-GCM.
 * - The encryption key is derived (scrypt) from a passphrase you supply at
 *   unlock time and held ONLY in this server process's memory. It is never
 *   written to disk and never sent to the browser.
 * - Decrypted private keys exist in memory only for the duration of a signing
 *   operation and are never logged, never serialized to responses.
 * - There is no remote custody. If someone gets your disk AND your passphrase,
 *   they get your keys. Treat the passphrase like a seed phrase.
 *
 * This is the honest tradeoff for a tool that signs transactions automatically:
 * to sign without a human present, the process must be able to decrypt. The
 * mitigation is local-only operation + passphrase-gated decryption.
 */

const SCRYPT_N = 1 << 15; // 32768
const SCRYPT_r = 8;
const SCRYPT_p = 1;
const KEY_LEN = 32;

// Process-memory passphrase. Set via unlock(), cleared via lock().
let sessionPassphrase: string | null = null;

export function unlockVault(passphrase: string) {
  if (!passphrase || passphrase.length < 8)
    throw new Error("Passphrase must be at least 8 characters");
  sessionPassphrase = passphrase;
}
export function lockVault() {
  sessionPassphrase = null;
}
export function isUnlocked() {
  return sessionPassphrase !== null;
}

function deriveKey(passphrase: string, salt: Buffer): Buffer {
  return crypto.scryptSync(passphrase, salt, KEY_LEN, {
    N: SCRYPT_N,
    r: SCRYPT_r,
    p: SCRYPT_p,
    maxmem: 256 * 1024 * 1024,
  });
}

export interface EncryptedBlob {
  v: 1;
  salt: string; // hex
  iv: string; // hex
  tag: string; // hex
  ct: string; // hex
}

/** Encrypt a private key string. Requires vault unlocked. */
export function encryptPrivateKey(privateKey: string): EncryptedBlob {
  if (!sessionPassphrase) throw new Error("Vault is locked");
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = deriveKey(sessionPassphrase, salt);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([
    cipher.update(privateKey.trim(), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  key.fill(0);
  return {
    v: 1,
    salt: salt.toString("hex"),
    iv: iv.toString("hex"),
    tag: tag.toString("hex"),
    ct: ct.toString("hex"),
  };
}

/** Decrypt to a viem account. The raw key is wiped from the local buffer
 *  immediately after the account object is constructed. */
export function decryptToAccount(blob: EncryptedBlob) {
  if (!sessionPassphrase) throw new Error("Vault is locked");
  const salt = Buffer.from(blob.salt, "hex");
  const iv = Buffer.from(blob.iv, "hex");
  const tag = Buffer.from(blob.tag, "hex");
  const key = deriveKey(sessionPassphrase, salt);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  let pk = "";
  try {
    pk =
      decipher.update(Buffer.from(blob.ct, "hex")).toString("utf8") +
      decipher.final("utf8");
  } catch {
    key.fill(0);
    throw new Error("Decryption failed — wrong passphrase or corrupted blob");
  }
  key.fill(0);
  const normalized = (pk.startsWith("0x") ? pk : `0x${pk}`) as `0x${string}`;
  const account = privateKeyToAccount(normalized);
  return account;
}

/** Derive the address from an encrypted blob without exposing the key. */
export function addressFromBlob(blob: EncryptedBlob): Address {
  return decryptToAccount(blob).address;
}

/** Validate a private key string and return its address, without storing. */
export function deriveAddress(privateKey: string): Address {
  const pk = privateKey.trim();
  const normalized = (pk.startsWith("0x") ? pk : `0x${pk}`) as `0x${string}`;
  return privateKeyToAccount(normalized).address;
}

/**
 * Returns the raw private key string for the in-process signer.
 * ONLY for libraries (opensea-js) that require an ethers Signer and cannot
 * accept a viem account. The string stays in this Node process, is never
 * logged, and is never returned over HTTP. Prefer decryptToAccount elsewhere.
 */
export function rawPrivateKeyForSigning(blob: EncryptedBlob): `0x${string}` {
  if (!sessionPassphrase) throw new Error("Vault is locked");
  const salt = Buffer.from(blob.salt, "hex");
  const iv = Buffer.from(blob.iv, "hex");
  const tag = Buffer.from(blob.tag, "hex");
  const key = deriveKey(sessionPassphrase, salt);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  let pk = "";
  try {
    pk = decipher.update(Buffer.from(blob.ct, "hex")).toString("utf8") + decipher.final("utf8");
  } catch {
    key.fill(0);
    throw new Error("Decryption failed — wrong passphrase or corrupted blob");
  }
  key.fill(0);
  return (pk.startsWith("0x") ? pk : `0x${pk}`) as `0x${string}`;
}
