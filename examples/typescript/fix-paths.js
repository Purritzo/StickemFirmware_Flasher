#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function fixPathsInFile(filePath) {
  console.log(`Fixing paths in: ${filePath}`);
  
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Fix absolute paths in HTML and JS files to relative paths
  // Convert /filename.hash.ext to ./filename.hash.ext
  content = content.replace(/"\//g, '"./');
  content = content.replace(/'\/[^']*'/g, (match) => {
    return match.replace(/'^\//, "'./");
  });
  
  // Fix importmap paths specifically
  content = content.replace(/"\/([^"]+)"/g, '"./$1"');
  
  fs.writeFileSync(filePath, content);
  console.log(`Fixed paths in: ${filePath}`);
}

function fixPathsInDirectory(dir) {
  const files = fs.readdirSync(dir);
  
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      // Skip docs directory to avoid breaking internal links
      if (file !== 'docs') {
        fixPathsInDirectory(filePath);
      }
    } else if (file.endsWith('.html') || file.endsWith('.js')) {
      fixPathsInFile(filePath);
    }
  });
}

// Fix paths in the dist directory
const distDir = path.join(__dirname, 'dist');
if (fs.existsSync(distDir)) {
  console.log('Fixing relative paths in dist directory...');
  fixPathsInDirectory(distDir);
  console.log('Path fixing complete!');
} else {
  console.error('dist directory not found!');
  process.exit(1);
}