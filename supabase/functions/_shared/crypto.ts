// Shared AES-GCM 256-bit Encryption & Decryption Utility for Logistics Secrets
// V2 uses SHA-256 key derivation with backward compatibility for V1 & Legacy formats

async function getDerivedKeyV2(secretKey: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const secretBytes = encoder.encode(secretKey);
  const hashBuffer = await crypto.subtle.digest("SHA-256", secretBytes);

  return await crypto.subtle.importKey(
    "raw",
    hashBuffer,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"]
  );
}

async function getDerivedKeyV1(secretKey: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const key32 = encoder.encode(secretKey.padEnd(32, '0').slice(0, 32));

  return await crypto.subtle.importKey(
    "raw",
    key32,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function encryptData(text: string, secretKey: string): Promise<string> {
  if (!text) throw new Error("No hay texto para cifrar");
  if (!secretKey) throw new Error("Falta clave secreta de cifrado");

  const keyMaterial = await getDerivedKeyV2(secretKey);
  
  // 12-byte (96-bit) cryptographically strong random IV
  const iv = crypto.getRandomValues(new Uint8Array(12));
  
  // Encrypt with 128-bit authentication tag appended automatically by WebCrypto
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, tagLength: 128 },
    keyMaterial,
    new TextEncoder().encode(text)
  );

  const ivHex = Array.from(iv).map(b => b.toString(16).padStart(2, '0')).join('');
  const encHex = Array.from(new Uint8Array(encrypted)).map(b => b.toString(16).padStart(2, '0')).join('');
  
  // V2 Format: v2:{ivHex}:{encHex}
  return `v2:${ivHex}:${encHex}`;
}

export async function decryptData(encryptedString: string, secretKey: string): Promise<string> {
  if (!encryptedString) throw new Error("Cadena vacía no se puede descifrar");
  if (!secretKey) throw new Error("Falta clave secreta de descifrado");

  let formatVersion = 'legacy';
  let ivHex = '';
  let encHex = '';

  if (encryptedString.startsWith('v2:')) {
    formatVersion = 'v2';
    const parts = encryptedString.split(':');
    if (parts.length !== 3) throw new Error("Formato de cifrado v2 inválido");
    ivHex = parts[1];
    encHex = parts[2];
  } else if (encryptedString.startsWith('v1:')) {
    formatVersion = 'v1';
    const parts = encryptedString.split(':');
    if (parts.length !== 3) throw new Error("Formato de cifrado v1 inválido");
    ivHex = parts[1];
    encHex = parts[2];
  } else {
    // Legacy format (iv:enc)
    const parts = encryptedString.split(':');
    if (parts.length !== 2) throw new Error("Formato de cifrado legado inválido");
    ivHex = parts[0];
    encHex = parts[1];
  }

  if (!ivHex || !encHex || ivHex.length !== 24) {
    throw new Error("Formato de IV o cifrado corrupto");
  }

  const iv = new Uint8Array(ivHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
  const encrypted = new Uint8Array(encHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));

  try {
    const keyMaterial = formatVersion === 'v2' 
      ? await getDerivedKeyV2(secretKey) 
      : await getDerivedKeyV1(secretKey);

    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv, tagLength: 128 },
      keyMaterial,
      encrypted
    );
    return new TextDecoder().decode(decrypted);
  } catch (err) {
    // Fallback attempt for legacy strings if v1 key failed
    if (formatVersion === 'legacy') {
      try {
        const keyMaterialV2 = await getDerivedKeyV2(secretKey);
        const decrypted = await crypto.subtle.decrypt(
          { name: "AES-GCM", iv, tagLength: 128 },
          keyMaterialV2,
          encrypted
        );
        return new TextDecoder().decode(decrypted);
      } catch {
        // Fallback failed
      }
    }
    throw new Error("Descifrado fallido: datos corruptos, alterados o clave secreta incorrecta.");
  }
}
