const ANCHOR_DATE = new Date(2026, 1, 1); // Feb 1 2026

function getShift1Users(dateStr, staffCount) {
    const current = new Date(dateStr);
    const diffTime = current.getTime() - ANCHOR_DATE.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    const weekIndex = Math.floor(diffDays / 7);

    const normalizedIndex = ((weekIndex * 2) % staffCount + staffCount) % staffCount;
    const s1_index1 = normalizedIndex;
    const s1_index2 = (normalizedIndex + 1) % staffCount;

    // Mock user IDs 1-5
    return [s1_index1 + 1, s1_index2 + 1];
}

console.log('--- Simulating Transition Feb -> March -> April ---');
// Feb 28 2026 (Saturday)
console.log('Feb 28:', getShift1Users('2026-02-28', 5));
// March 1 2026 (Sunday) - Should check if rotation changes or stays consistent week-wise
console.log('Mar 01:', getShift1Users('2026-03-01', 5));

// Check a few weeks into March
console.log('Mar 08:', getShift1Users('2026-03-08', 5));
console.log('Mar 15:', getShift1Users('2026-03-15', 5));
