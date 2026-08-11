import type { CheckIn, ExploreSpot, GeoPoint, WalkRecord } from "../types";
import { distanceBetween } from "./geo";

const DAY = 86_400_000;
const today = new Date();
today.setHours(9, 12, 0, 0);

const samplePath = [
  [35.68134, 139.76589],
  [35.68198, 139.76762],
  [35.68272, 139.76953],
  [35.68365, 139.77093],
  [35.68482, 139.77176],
  [35.68559, 139.77048],
  [35.68668, 139.76908],
  [35.68753, 139.76747],
  [35.68834, 139.76603],
];

export const SAMPLE_RECORDS: WalkRecord[] = [0, 2].map((offset, recordIndex) => {
  const startedAt = today.getTime() - offset * DAY;
  const points = samplePath.map(([lat, lng], index) => ({
    lat: lat + recordIndex * 0.0038,
    lng: lng - recordIndex * 0.004,
    timestamp: startedAt + index * 9 * 60_000,
    accuracy: 8,
    altitude: 8 + index * 0.8,
    breakBefore: index === 0,
  }));
  const calculatedDistance = points.slice(1).reduce((sum, point, index) => sum + distanceBetween(points[index], point), 0);
  return {
    id: `sample-${recordIndex}`,
    startedAt,
    endedAt: startedAt + (recordIndex === 0 ? 7_260_000 : 4_920_000),
    durationMs: recordIndex === 0 ? 7_260_000 : 4_920_000,
    distanceM: calculatedDistance * (recordIndex === 0 ? 4.7 : 3.2),
    cumulativeElevationM: recordIndex === 0 ? 48 : 31,
    points,
    isSample: true,
  };
});

const SAMPLE_CHECKPOINTS = [
  { pointIndex: 3, minuteOffset: 27, spotId: "sample-bridge", spotName: "旧街道の道標", category: "史跡" as const },
  { pointIndex: 6, minuteOffset: 54, spotId: "sample-shrine", spotName: "まちの鎮守さま", category: "神社・寺" as const },
];

export function createSampleCheckIns(walkId: string, startedAt: number, points: GeoPoint[]): CheckIn[] {
  return SAMPLE_CHECKPOINTS.flatMap((checkpoint) => {
    const point = points[checkpoint.pointIndex];
    if (!point) return [];
    return [{
      id: `${walkId}-${checkpoint.spotId}`,
      spotId: checkpoint.spotId,
      spotName: checkpoint.spotName,
      category: checkpoint.category,
      checkedInAt: startedAt + checkpoint.minuteOffset * 60_000,
      lat: point.lat,
      lng: point.lng,
      distanceFromCurrentM: 0,
      walkId,
    } satisfies CheckIn];
  });
}

export const SAMPLE_CHECK_INS = createSampleCheckIns(
  SAMPLE_RECORDS[0].id,
  SAMPLE_RECORDS[0].startedAt,
  SAMPLE_RECORDS[0].points,
);

export function fallbackSpots(lat: number, lng: number): ExploreSpot[] {
  const candidates: Omit<ExploreSpot, "distanceM">[] = [
    {
      id: "fallback-1",
      name: "まちの鎮守さま",
      category: "神社・寺",
      lat: lat + 0.0042,
      lng: lng + 0.0018,
      description: "地域の歩みを静かに見守ってきた、小さな社寺です。",
    },
    {
      id: "fallback-2",
      name: "旧街道の道標",
      category: "史跡",
      lat: lat - 0.0031,
      lng: lng + 0.0044,
      description: "かつて人々が行き交った道の記憶を伝える道標です。",
    },
    {
      id: "fallback-3",
      name: "郷土資料館",
      category: "文化施設",
      lat: lat + 0.0065,
      lng: lng - 0.0029,
      description: "土地の暮らしや歴史を資料とともに紹介する施設です。",
    },
    {
      id: "fallback-4",
      name: "水辺の緑道",
      category: "公園・自然",
      lat: lat - 0.006,
      lng: lng - 0.0037,
      description: "季節の草木を眺めながら歩ける、静かな散策路です。",
    },
  ];
  return candidates
    .map((spot) => ({ ...spot, distanceM: distanceBetween({ lat, lng }, spot) }))
    .sort((a, b) => a.distanceM - b.distanceM);
}
