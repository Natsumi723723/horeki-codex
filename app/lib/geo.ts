import type { GeoPoint, WalkRecord } from "../types";

const EARTH_RADIUS_M = 6_371_000;
const AVERAGE_STRIDE_M = 0.72;

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

export function distanceBetween(a: Pick<GeoPoint, "lat" | "lng">, b: Pick<GeoPoint, "lat" | "lng">) {
  const latitudeDelta = toRadians(b.lat - a.lat);
  const longitudeDelta = toRadians(b.lng - a.lng);
  const latitudeA = toRadians(a.lat);
  const latitudeB = toRadians(b.lat);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(latitudeA) * Math.cos(latitudeB) * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(haversine));
}

export type PointDecision = {
  accept: boolean;
  distanceM: number;
  breakBefore: boolean;
  reason?: "accuracy" | "noise" | "jump" | "speed";
};

export function evaluatePoint(previous: GeoPoint | undefined, candidate: GeoPoint): PointDecision {
  if (candidate.accuracy > 80) {
    return { accept: false, distanceM: 0, breakBefore: false, reason: "accuracy" };
  }
  if (!previous) {
    return { accept: true, distanceM: 0, breakBefore: true };
  }

  const elapsedSeconds = Math.max(1, (candidate.timestamp - previous.timestamp) / 1000);
  const distanceM = distanceBetween(previous, candidate);
  const speedMps = distanceM / elapsedSeconds;

  if (distanceM < Math.max(2.5, Math.min(previous.accuracy, candidate.accuracy) * 0.12)) {
    return { accept: false, distanceM: 0, breakBefore: false, reason: "noise" };
  }
  if (distanceM > 250 || speedMps > 4.5) {
    return { accept: false, distanceM: 0, breakBefore: false, reason: distanceM > 250 ? "jump" : "speed" };
  }

  const breakBefore = elapsedSeconds > 90;
  return { accept: true, distanceM: breakBefore ? 0 : distanceM, breakBefore };
}

export function splitIntoSegments(points: GeoPoint[]) {
  return points.reduce<GeoPoint[][]>((segments, point, index) => {
    if (index === 0 || point.breakBefore) segments.push([]);
    segments.at(-1)?.push(point);
    return segments;
  }, []);
}

export function calculateElevation(points: GeoPoint[]) {
  let total = 0;
  let usablePairs = 0;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    if (current.breakBefore || previous.altitude === null || current.altitude === null) continue;
    const gain = current.altitude - previous.altitude;
    if (gain > 1 && gain < 25) total += gain;
    usablePairs += 1;
  }
  return usablePairs > 2 ? total : null;
}

export function formatDistance(distanceM: number) {
  if (distanceM < 1000) return `${Math.round(distanceM)} m`;
  return `${(distanceM / 1000).toFixed(distanceM >= 10_000 ? 1 : 2)} km`;
}

export function formatDuration(durationMs: number) {
  const totalMinutes = Math.max(0, Math.floor(durationMs / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}時間${minutes}分` : `${minutes}分`;
}

export function formatClockDuration(durationMs: number) {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((part) => String(part).padStart(2, "0")).join(":");
}

export function estimateSteps(distanceM: number) {
  return Math.max(0, Math.round(distanceM / AVERAGE_STRIDE_M));
}

export function formatSteps(stepCount: number) {
  return new Intl.NumberFormat("ja-JP").format(Math.max(0, Math.round(stepCount)));
}

export function averageSpeed(record: WalkRecord) {
  if (!record.durationMs) return "0.0";
  return ((record.distanceM / 1000) / (record.durationMs / 3_600_000)).toFixed(1);
}
