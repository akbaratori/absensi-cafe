function simulateRolling(days, staffCount) {
    console.log(`Simulating ${days} days with ${staffCount} staff...`);

    // Mock Staff IDs
    const staffIds = Array.from({ length: staffCount }, (_, i) => i + 1);

    // Mock Month Start (Feb 1 2026)
    const startDate = new Date(2026, 1, 1); // Feb 1

    for (let i = 0; i < days; i++) {
        let current = new Date(startDate);
        current.setDate(current.getDate() + i);

        const dayOfMonth = current.getDate();
        const weekIndex = Math.floor((dayOfMonth - 1) / 7);

        // Logic
        const s1_index1 = (weekIndex * 2) % staffCount;
        const s1_index2 = (weekIndex * 2 + 1) % staffCount;

        const s1_users = [staffIds[s1_index1], staffIds[s1_index2]];

        // Print only on week change or first day
        if (i === 0 || (dayOfMonth - 1) % 7 === 0) {
            console.log(`Day ${dayOfMonth} (Week ${weekIndex}): Shift 1 = [${s1_users.join(', ')}]`);
        }
    }
}

simulateRolling(31, 5);
