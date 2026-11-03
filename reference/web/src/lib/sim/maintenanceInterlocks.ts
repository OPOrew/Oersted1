/**
 * The Boeing 737 AMM ATA 24-11 generator-drive disconnect procedure states
 * that a disconnected drive is reset only on the ground after engine shutdown.
 * N2 <= 5% is a trainer near-stop criterion, not a published Boeing limit.
 */
export function canResetGeneratorDrive(weightOnWheels: boolean, engineN2Percent: number): boolean {
  return weightOnWheels && Number.isFinite(engineN2Percent) && engineN2Percent <= 5;
}
