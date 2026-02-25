function simulateSchedule(startDateStr, months, baseOffDay, rotateOffDay) {
    console.log(`\n--- Simulating Schedule: Start=${startDateStr}, Months=${months}, BaseOff=${baseOffDay}, Rotate=${rotateOffDay} ---`);

    const startDate = new Date(startDateStr);
    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + months);

    let currentDate = new Date(startDate);
    let currentOffDay = baseOffDay;
    let lastMonth = currentDate.getMonth();

    const offDays = [];

    while (currentDate < endDate) {
        const dayOfWeek = currentDate.getDay(); // 0=Sun
        const currentMonth = currentDate.getMonth();

        // Rotation Logic
        if (rotateOffDay && currentMonth !== lastMonth && currentOffDay !== -1) {
            const oldOff = currentOffDay;
            currentOffDay = (currentOffDay + 1) % 7;
            console.log(`[Month Change] ${lastMonth + 1} -> ${currentMonth + 1}. Off Day Rotated: ${dayName(oldOff)} -> ${dayName(currentOffDay)}`);
            lastMonth = currentMonth;
        }

        if (dayOfWeek === currentOffDay) {
            offDays.push({
                date: currentDate.toISOString().split('T')[0],
                day: dayName(dayOfWeek)
            });
        }

        currentDate.setDate(currentDate.getDate() + 1);
    }

    // Print Summary per Month
    const byMonth = {};
    offDays.forEach(o => {
        const m = o.date.substring(0, 7);
        if (!byMonth[m]) byMonth[m] = [];
        byMonth[m].push(o.day);
    });

    Object.keys(byMonth).forEach(m => {
        const days = byMonth[m];
        console.log(`Month ${m}: ${days.length} Off Days. Days: ${days[0]}...`);
        // Check consistency
        const counts = {};
        days.forEach(d => counts[d] = (counts[d] || 0) + 1);
        console.log(`   Distribution:`, counts);
    });
}

function dayName(d) {
    const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return names[d] || 'None';
}

// Test Case 1: Feb 1 start (Sunday), Off=Tuesday (2), Rotate=True
simulateSchedule('2026-02-01', 3, 2, true);

// Test Case 2: Start Feb 1, Off=Sunday (0)
simulateSchedule('2026-02-01', 3, 0, true);
