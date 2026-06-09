export async function decryptData(encryptedHex: string, secretKey: string): Promise<string> {
  const [ivHex, encHex] = encryptedHex.split(':');
  if (!ivHex || !encHex) throw new Error("Invalid encrypted data format");

  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secretKey.padEnd(32, '0').slice(0, 32)),
    { name: "AES-GCM" },
    false,
    ["decrypt"]
  );

  const iv = new Uint8Array(ivHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
  const encrypted = new Uint8Array(encHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));

  try {
    const decryptedBuffer = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      keyMaterial,
      encrypted
    );
    return new TextDecoder().decode(decryptedBuffer);
  } catch (err) {
    throw new Error("Failed to decrypt credentials");
  }
}
