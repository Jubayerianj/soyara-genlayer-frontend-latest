const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, '../subgraph');
const destDir = path.join(__dirname, '../subgraph-v2');

const excludes = ['node_modules', 'build', 'generated', '.next', '.git'];

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (excludes.includes(entry.name)) {
      continue;
    }

    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

try {
  console.log(`Copying subgraph files from ${srcDir} to ${destDir}...`);
  copyDir(srcDir, destDir);
  console.log('✅ Copy complete!');
} catch (err) {
  console.error('❌ Failed to copy directory:', err.message);
  process.exit(1);
}
