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

export function approachGuidanceText(sideMeters: number, alongMeters: number, verticalMeters: number) {
  const corrections: string[] = [];
  if (Math.abs(sideMeters) >= PICKUP_TOLERANCE_METERS) {
    const turnDegrees = (Math.atan2(sideMeters, alongMeters) * 180) / Math.PI;
    corrections.push(`SLEW ${turnDegrees > 0 ? "RIGHT" : "LEFT"} ${Math.round(Math.abs(turnDegrees))}°`);
  }
  if (Math.abs(alongMeters) >= PICKUP_TOLERANCE_METERS) {
    corrections.push(`BOOM ${alongMeters > 0 ? "OUT" : "IN"} ${Math.abs(alongMeters).toFixed(1)} m`);
  }
  if (Math.abs(verticalMeters) >= PICKUP_TOLERANCE_METERS) {
    corrections.push(`HOOK ${verticalMeters > 0 ? "UP" : "DOWN"} ${Math.abs(verticalMeters).toFixed(1)} m`);
  }
  return corrections.length > 0 ? corrections.join(" · ") : "TARGET CENTERED";
}

export function amberRingMessage(distanceMeters: number, radiusMeters = 2.4) {
  return distanceMeters < radiusMeters
    ? "Inside amber ring. Lower carefully."
    : `Amber ring ${distanceMeters.toFixed(1)} m away. Move the load over it before lowering.`;
}
