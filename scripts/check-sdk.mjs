// Verifies that the vendored Ulanzi SDK files are byte-for-byte the ones pinned in sdk-lock.json.
// Git on Windows may check text out as CRLF, so line endings are normalized before hashing.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

function sha256Lf(buffer) {
  const normalized = Buffer.from(buffer.toString('utf8').replace(/\r\n/g, '\n'), 'utf8');
  return createHash('sha256').update(normalized).digest('hex');
}

export function verifyVendoredSdk(root, lock) {
  const problems = [];
  let checked = 0;
  for (const copy of lock.copies) {
    for (const [file, expected] of Object.entries(copy.files)) {
      const path = join(root, copy.path, file);
      let actual;
      try {
        actual = sha256Lf(readFileSync(path));
      } catch {
        problems.push(`missing ${copy.path}/${file}`);
        continue;
      }
      checked += 1;
      if (actual !== expected) problems.push(`changed ${copy.path}/${file}`);
    }
  }
  return { checked, problems };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const lock = JSON.parse(readFileSync(join(ROOT, 'sdk-lock.json'), 'utf8'));
  const { checked, problems } = verifyVendoredSdk(ROOT, lock);
  if (problems.length) {
    console.error(`Vendored Ulanzi SDK does not match sdk-lock.json:\n  ${problems.join('\n  ')}`);
    process.exit(1);
  }
  console.log(`Vendored Ulanzi SDK: ${checked} files match sdk-lock.json`);
}
