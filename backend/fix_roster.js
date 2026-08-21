const p = require('./src/utils/database');

(async () => {
  try {
    // 1. Update capacities
    await p.position.update({ where: { id: 1 }, data: { shift1Capacity: 1, shift2Capacity: 1 } }); // Bar
    await p.position.update({ where: { id: 2 }, data: { shift1Capacity: 2, shift2Capacity: 3 } }); // Dapur

    // 2. Rebuild Bar roster: Gio(4) shift1, Baso(3) shift2
    await p.positionRoster.deleteMany({ where: { positionId: 1 } });
    await p.positionRoster.createMany({
      data: [
        { positionId: 1, userId: 4, orderIndex: 0, shiftNumber: 1 }, // Gio
        { positionId: 1, userId: 3, orderIndex: 1, shiftNumber: 2 }, // Baso
      ],
    });

    // 3. Rebuild Dapur roster: Wulan(5), Juli(6) shift1; Nhelam(7), Indy(8), akbar(9) shift2
    await p.positionRoster.deleteMany({ where: { positionId: 2 } });
    await p.positionRoster.createMany({
      data: [
        { positionId: 2, userId: 5, orderIndex: 0, shiftNumber: 1 }, // Wulan
        { positionId: 2, userId: 6, orderIndex: 1, shiftNumber: 1 }, // Juli
        { positionId: 2, userId: 7, orderIndex: 2, shiftNumber: 2 }, // Nhelam
        { positionId: 2, userId: 8, orderIndex: 3, shiftNumber: 2 }, // Indy
        { positionId: 2, userId: 9, orderIndex: 4, shiftNumber: 2 }, // akbar
      ],
    });

    // 4. Reset rotation state for both positions
    await p.rotationState.upsert({
      where: { positionId: 1 },
      update: { currentStartIndex: 0, lastGeneratedWeekStart: null },
      create: { positionId: 1, currentStartIndex: 0 },
    });
    await p.rotationState.upsert({
      where: { positionId: 2 },
      update: { currentStartIndex: 0, lastGeneratedWeekStart: null },
      create: { positionId: 2, currentStartIndex: 0 },
    });

    console.log('DONE');
  } catch (e) {
    console.error('ERR', e.message);
  } finally {
    await p.$disconnect();
    process.exit(0);
  }
})();