/**
 * Reset admin/employee seed passwords to password123
 * Run this against the production database after updating seed.sql.
 */
require('dotenv').config();
const bcrypt = require('bcrypt');
const prisma = require('../src/utils/database');

async function main() {
  const password = 'password123';
  const hash = await bcrypt.hash(password, 10);

  const result = await prisma.user.updateMany({
    where: {
      username: {
        in: ['admin', 'employee'],
      },
    },
    data: {
      passwordHash: hash,
    },
  });

  console.log(`Updated ${result.count} user(s) to password: ${password}`);
}

main()
  .catch((err) => {
    console.error('Failed to reset passwords:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
