const p = require('./src/utils/database');
(async () => {
  const users = await p.user.findMany({ select: { id: true, fullName: true, role: true, isActive: true, department: true } });
  const pos = await p.position.findMany({ include: { rosters: true } });
  const out = {
    users,
    positions: pos.map(x => ({ id: x.id, name: x.name, s1: x.shift1Capacity, s2: x.shift2Capacity, rosters: x.rosters.map(r => ({ uid: r.userId, order: r.orderIndex, shift: r.shiftNumber })) })),
  };
  require('fs').writeFileSync('inspect_out.json', JSON.stringify(out, null, 2));
  await p.$disconnect();
  process.exit(0);
})();