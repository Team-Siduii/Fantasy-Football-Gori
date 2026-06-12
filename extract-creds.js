const fs = require('fs');
const env = fs.readFileSync('.env.prod', 'utf-8');
const lines = env.split('\n');
for (const line of lines) {
  if (line.startsWith('WKCOACH_EMAIL=')) {
    process.env.WKCOACH_EMAIL = line.substring(14).replace(/"/g, '').trim();
  }
  if (line.startsWith('WKCOACH_PASSWORD=*** {
    process.env.WKCOACH_PASSWORD = line.substring(17).replace(/"/g, '').trim();
  }
}
console.log('Email:', process.env.WKCOACH_EMAIL);
console.log('Pass length:', (process.env.WKCOACH_PASSWORD || '').length);
