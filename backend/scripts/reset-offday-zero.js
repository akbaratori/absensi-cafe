const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  // Reset legacy offDay=0 (Sunday) -> null. Sunday is a normal work day per
  // business rules, and 0 was the old "unset" default that has been wrongly
  // interpreted as "off on Sunday". -1 (rolling "no fixed day off") is kept.
  const result = await p.user.updateMany({
    where: { offDay: 0 },
    data: { offDay: null },
  });

  console.log(`Reset offDay=0 -> null for ${result.count} users`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => p.$disconnect());
