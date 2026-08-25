const fs = require('fs');

// Read routes/index.js
const routesPath = './src/routes/index.js';
let content = fs.readFileSync(routesPath, 'utf8');

// Check if telegram already registered
if (content.includes('telegram')) {
  console.log('✅ Telegram routes sudah registered');
  process.exit(0);
}

// Add telegram route require
const requireSection = content.match(/const .*Routes = require\('\.\/.*'\);/g);
const lastRequire = requireSection[requireSection.length - 1];
const insertPoint = content.indexOf(lastRequire) + lastRequire.length;

const telegramRequire = "\nconst telegramRoutes = require('./telegram');";
content = content.slice(0, insertPoint) + telegramRequire + content.slice(insertPoint);

// Add telegram router.use
const routerUseSection = content.match(/router\.use\('\/.*', .*Routes\);/g);
const lastUse = routerUseSection[routerUseSection.length - 1];
const useInsertPoint = content.indexOf(lastUse) + lastUse.length;

const telegramUse = "\nrouter.use('/telegram', telegramRoutes);";
content = content.slice(0, useInsertPoint) + telegramUse + content.slice(useInsertPoint);

// Write back
fs.writeFileSync(routesPath, content);
console.log('✅ Telegram routes registered in index.js');
