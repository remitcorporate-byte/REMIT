import crypto from 'crypto';

const PREFIX = 'enc:v1:';

function encryptionKey(): Buffer {
  const value = process.env.FIELD_ENCRYPTION_KEY;
  if (!value) {
    throw new Error('FIELD_ENCRYPTION_KEY is required to encrypt employee account numbers');
  }

  let key: Buffer;
  try {
    key = Buffer.from(value, 'base64');
  } catch {
    throw new Error('FIELD_ENCRYPTION_KEY must be a base64-encoded 32-byte key');
  }
  if (key.length !== 32) {
    throw new Error('FIELD_ENCRYPTION_KEY must be a base64-encoded 32-byte key');
  }
  return key;
}

export function isEncryptedField(value: string): boolean {
  return value.startsWith(PREFIX);
}

export function encryptField(value: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString('base64')}:${tag.toString('base64')}:${ciphertext.toString('base64')}`;
}

export function decryptField(value: string): string {
  if (!isEncryptedField(value)) return value;

  const [, version, ivEncoded, tagEncoded, ciphertextEncoded] = value.split(':');
  if (version !== 'v1' || !ivEncoded || !tagEncoded || !ciphertextEncoded) {
    throw new Error('Invalid encrypted field format');
  }

  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    encryptionKey(),
    Buffer.from(ivEncoded, 'base64')
  );
  decipher.setAuthTag(Buffer.from(tagEncoded, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextEncoded, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

export function accountNumberLast4(value: string): string {
  return decryptField(value).slice(-4);
}
