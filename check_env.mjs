import fs from 'fs';

const content = fs.readFileSync('/tmp/gori/.env.real', 'utf8');
const lines = content.split('\n');
for (const line of lines) {
  if (line.includes('DATABASE_URL')) {
    // Show first/last parts to understand the format
    const parts = line.split('=');
    if (parts.length >= 2) {
      const val = parts.slice(1).join('=');
      console.log(`Key: ${parts[0]}`);
      console.log(`Value starts: ${val.substring(0, 20)}...`);
      console.log(`Value ends: ...${val.substring(val.length - 20)}`);
      console.log(`Value contains @: ${val.includes('@')}`);
      console.log(`Value contains neon: ${val.includes('neon')}`);
      console.log(`Value length: ${val.length}`);
      console.log('---');
    }
  }
}
