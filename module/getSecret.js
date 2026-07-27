import fs from 'node:fs';

export function getSecret(filePath, secretName) {
  try {
    const secret = fs.readFileSync(filePath, 'utf8').trim();
    if (!secret) throw new Error("File is empty");
    console.log(`Successfully read ${secretName} from secret.`);
    return secret;
  } catch (err) {
    console.error(`CRITICAL: Failed to read ${secretName}:`, err.message);
    process.exit(1);
  }
}