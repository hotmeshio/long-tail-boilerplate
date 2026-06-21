export { pipeline } from './pipeline';
export { station } from './station';
export { printstation } from './printstation';
export { printer } from './printer';

// Efficient (atomic-escalation) variants — sit beside the legacy leaves so the
// two pipelines can be compared on identical work. See station-efficient.ts.
export { stationEfficient } from './station-efficient';
export { printstationEfficient } from './printstation-efficient';
export { printerEfficient } from './printer-efficient';
