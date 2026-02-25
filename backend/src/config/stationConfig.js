/**
 * Kitchen Station Configuration
 * Defines the stations and their priority/requirements
 */

const KITCHEN_STATIONS = [
    'A - Main Cook',
    'B - Support Cook / Snack',
    'C - Checker / Stock',
    'D - Runner / Area',
    'E - Helper / Floating'
];

// Priority order: A -> B -> C -> D -> E
const PRIORITY_ORDER = [
    'A - Main Cook',
    'B - Support Cook / Snack',
    'C - Checker / Stock',
    'D - Runner / Area',
    'E - Helper / Floating'
];

module.exports = {
    KITCHEN_STATIONS,
    PRIORITY_ORDER
};
