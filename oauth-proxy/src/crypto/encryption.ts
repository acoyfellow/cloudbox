const SALT_LENGTH_BYTES = 16;
const IV_LENGTH_BYTES = 12;

/**
 * Derive an AES-256-GCM key from the master key using HKDF-SHA256.
 *
 * @param masterKeyB64 - Base64-encoded 256-bit master key
 * @param info - Per-user differentiator (DO ID via ctx.id.toString())
 * @param salt - Per-value random salt (unique per encryption)
 */
async function deriveKey(masterKeyB64: string, info: string, salt: Uint8Array): Promise<CryptoKey> {
	if (!masterKeyB64) throw new Error("Missing or invalid Env binding: MASTER_KEY");
	const rawKey = Uint8Array.from(atob(masterKeyB64.trim()), (c) => c.charCodeAt(0)).buffer as ArrayBuffer;
	const saltBuffer = new Uint8Array(salt).buffer as ArrayBuffer;

	const importedKey = await crypto.subtle.importKey("raw", rawKey, "HKDF", false, ["deriveKey"]);

	return crypto.subtle.deriveKey(
		{
			name: "HKDF",
			hash: "SHA-256",
			salt: saltBuffer,
			info: new TextEncoder().encode(info),
		},
		importedKey,
		{ name: "AES-GCM", length: 256 },
		false,
		["encrypt", "decrypt"],
	);
}

/**
 * Encrypt a plaintext string with AES-256-GCM.
 *
 * Each call generates a random salt (for HKDF key derivation) and a random IV
 * (for AES-GCM). Both are prepended to the output.
 *
 * Output format: base64(salt || IV || ciphertext+tag)
 *
 * @param masterKeyB64 - Base64-encoded 256-bit master key
 * @param info - Per-user differentiator (DO ID)
 * @param plaintext - The string to encrypt
 * @returns Base64-encoded blob: salt || IV || ciphertext+tag
 */
export async function encrypt(
	masterKeyB64: string,
	info: string,
	plaintext: string,
): Promise<string> {
	const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH_BYTES));
	const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH_BYTES));
	const key = await deriveKey(masterKeyB64, info, salt);
	const encoded = new TextEncoder().encode(plaintext);

	const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);

	// salt || IV || ciphertext+tag
	const combined = new Uint8Array(salt.length + iv.length + ciphertext.byteLength);
	combined.set(salt, 0);
	combined.set(iv, salt.length);
	combined.set(new Uint8Array(ciphertext), salt.length + iv.length);

	return btoa(String.fromCharCode(...combined));
}

/**
 * Decrypt a base64-encoded blob produced by encrypt().
 *
 * Extracts the salt and IV from the prefix, derives the same key
 * via HKDF, and decrypts with AES-256-GCM.
 *
 * @param masterKeyB64 - Base64-encoded 256-bit master key
 * @param info - Per-user differentiator (must match the value used for encryption)
 * @param blob - Base64-encoded string: salt || IV || ciphertext+tag
 * @returns The decrypted plaintext string
 * @throws If the blob is tampered with or the wrong key/info is used
 */
export async function decrypt(masterKeyB64: string, info: string, blob: string): Promise<string> {
	const combined = Uint8Array.from(atob(blob), (c) => c.charCodeAt(0));

	const salt = combined.slice(0, SALT_LENGTH_BYTES);
	const iv = combined.slice(SALT_LENGTH_BYTES, SALT_LENGTH_BYTES + IV_LENGTH_BYTES);
	const ciphertext = combined.slice(SALT_LENGTH_BYTES + IV_LENGTH_BYTES);

	const key = await deriveKey(masterKeyB64, info, salt);

	const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);

	return new TextDecoder().decode(decrypted);
}
