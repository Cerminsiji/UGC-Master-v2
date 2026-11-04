const fs = require('fs');
const path = require('path');

const filesToPatch = [
  path.join(__dirname, '../node_modules/next/dist/server/app-render/entry-base.js'),
  path.join(__dirname, '../node_modules/next/dist/esm/server/app-render/entry-base.js'),
];

for (const filePath of filesToPatch) {
  if (fs.existsSync(filePath)) {
    let content = fs.readFileSync(filePath, 'utf8');
    const target = /if\s*\(\s*process\.env\.NODE_ENV\s*===\s*['"]development['"]\s*\)\s*\{\s*const\s+mod\s*=\s*require\(['"][^'"]*segment-explorer-node['"]\);?\s*SegmentViewNode\s*=\s*mod\.SegmentViewNode;?\s*SegmentViewStateNode\s*=\s*mod\.SegmentViewStateNode;?\s*\}/g;
    
    if (target.test(content)) {
      content = content.replace(target, '/* devtools segment-explorer disabled */');
      // Also ensure SegmentViewNode passes children through
      content = content.replace(
        /let\s+SegmentViewNode\s*=\s*\(\s*\)\s*=>\s*null;?/g,
        'let SegmentViewNode = (props) => (props && props.children) ? props.children : null;'
      );
      fs.writeFileSync(filePath, content, 'utf8');
      console.log(`Successfully patched: ${filePath}`);
    } else {
      console.log(`Pattern not found or already patched: ${filePath}`);
    }
  }
}

// Also patch segment-explorer-node.js to avoid 'use client' boundary issue
const segmentNodeFile = path.join(__dirname, '../node_modules/next/dist/next-devtools/userspace/app/segment-explorer-node.js');
if (fs.existsSync(segmentNodeFile)) {
  let segContent = fs.readFileSync(segmentNodeFile, 'utf8');
  if (segContent.includes("'use client'")) {
    segContent = segContent.replace(/'use client';?/g, '// use client disabled');
    fs.writeFileSync(segmentNodeFile, segContent, 'utf8');
    console.log(`Successfully patched: ${segmentNodeFile}`);
  }
}
