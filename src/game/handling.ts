export const PICKUP_TOLERANCE_METERS = 0.3;

export function isPickupAligned(horizontalMeters: number, verticalMeters: number) {
  return horizontalMeters < PICKUP_TOLERANCE_METERS && Math.abs(verticalMeters) < PICKUP_TOLERANCE_METERS;
}

export function pickupAlignmentMessage(label: string, horizontalMeters: number, verticalMeters: number) {
  const horizontal =
    horizontalMeters < PICKUP_TOLERANCE_METERS ? "centered" : `${horizontalMeters.toFixed(2)} m off center`;
  const vertical =
    Math.abs(verticalMeters) < PICKUP_TOLERANCE_METERS
      ? "height set"
      : `${verticalMeters > 0 ? "raise" : "lower"} ${Math.abs(verticalMeters).toFixed(2)} m`;
  return `${label}: ${horizontal}; ${vertical}.`;
}

export function amberRingMessage(distanceMeters: number, radiusMeters = 2.4) {
  return distanceMeters < radiusMeters
    ? "Inside amber ring. Lower carefully."
    : `Amber ring ${distanceMeters.toFixed(1)} m away. Move the load over it before lowering.`;
}
