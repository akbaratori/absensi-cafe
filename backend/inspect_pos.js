const p = require('./src/utils/database');
(async () => {
  const pos = await p.position.findMany({
    include: {
      rosters: { include: { user: { select: { id: true, fullName: true } } } },
    },
  });
  console.log(JSON.stringify(
    pos.map((x) => ({
      id: x.id,
      name: x.name,
      s1: x.shift1Capacity,
      s2: x.shift2Capacity,
      rosters: x.rosters.map((r) => ({ uid: r.userId, name: r.user.fullName, shiftNumber: r.shiftNumber })),
    })),
    null,
    2,
  ));
  await p.$disconnect();
  process.exit(0);
})();