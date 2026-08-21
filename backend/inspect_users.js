const p = require('./src/utils/database');
(async () => {
  const users = await p.user.findMany({ select: { id: true, fullName: true, role: true, isActive: true, department: true, shiftId: true } });
  console.log('USERS:');
  console.log(JSON.stringify(users, null, 2));
  const pos = await p.position.findMany({ include: { rosters: true } });
  console.log('POSITIONS+ROSTERS:');
  console.log(JSON.stringify(pos.map(x => ({ id: x.id, name: x.name, s1: x.shift1Capacity, s2: x.shift2Capacity, rosters: x.rosters.map(r => ({ uid: r.userId, order: r.orderIndex, shift: r.shiftNumber })) })), null, 2));
  await p.$disconnect();
  process.exit(0);
})();