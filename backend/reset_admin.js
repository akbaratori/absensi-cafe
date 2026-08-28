require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const p = new PrismaClient();

async function main() {
  const hash = await bcrypt.hash('Admin@12345', 10);
  console.log('New hash:', hash);

  // List all users first
  const users = await p.users.findMany({
    select: { id: true, username: true, role: true, is_active: true, telegram_user_id: true }
  });
  console.log('Users:', JSON.stringify(users, null, 2));

  // Reset admin password
  const updated = await p.users.updateMany({
    where: { role: 'ADMIN' },
    data: { password_hash: hash }
  });
  console.log('Updated admin rows:', updated.count);

  await p.$disconnect();
}

main().catch(e => { console.error(e); p.$disconnect(); });
