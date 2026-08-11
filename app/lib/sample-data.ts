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
  {
    pointIndex: 3,
    minuteOffset: 27,
    spotId: "sample-bridge",
    spotName: "旧街道の道標",
    category: "史跡" as const,
    imageUrl: "https://commons.wikimedia.org/wiki/Special:Redirect/file/Shoin%20shrine%20main%20torii%20-%20taisho%20era.jpg?width=900",
    imageAlt: "大正期の松陰神社の鳥居（歴史カテゴリのイメージ）",
    imageCredit: "Wikimedia Commons（カテゴリイメージ）",
  },
  {
    pointIndex: 6,
    minuteOffset: 54,
    spotId: "sample-shrine",
    spotName: "まちの鎮守さま",
    category: "神社・寺" as const,
    imageUrl: "https://commons.wikimedia.org/wiki/Special:Redirect/file/Modern%20Torii.JPG?width=900",
    imageAlt: "東京都内の神社の鳥居（カテゴリイメージ）",
    imageCredit: "Wikimedia Commons / Asanagi（カテゴリイメージ）",
  },
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
      imageUrl: checkpoint.imageUrl,
      imageAlt: checkpoint.imageAlt,
      imageCredit: checkpoint.imageCredit,
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
      imageUrl: "https://commons.wikimedia.org/wiki/Special:Redirect/file/Modern%20Torii.JPG?width=900",
      imageAlt: "東京都内の神社の鳥居（カテゴリイメージ）",
      imageCredit: "Wikimedia Commons / Asanagi（カテゴリイメージ）",
      imageSourceUrl: "https://commons.wikimedia.org/wiki/File:Modern_Torii.JPG",
    },
    {
      id: "fallback-2",
      name: "旧街道の道標",
      category: "史跡",
      lat: lat - 0.0031,
      lng: lng + 0.0044,
      description: "かつて人々が行き交った道の記憶を伝える道標です。",
      imageUrl: "https://commons.wikimedia.org/wiki/Special:Redirect/file/Shoin%20shrine%20main%20torii%20-%20taisho%20era.jpg?width=900",
      imageAlt: "大正期の松陰神社の鳥居（歴史カテゴリのイメージ）",
      imageCredit: "Wikimedia Commons（パブリックドメイン・カテゴリイメージ）",
      imageSourceUrl: "https://commons.wikimedia.org/wiki/File:Shoin_shrine_main_torii_-_taisho_era.jpg",
    },
    {
      id: "fallback-3",
      name: "郷土資料館",
      category: "文化施設",
      lat: lat + 0.0065,
      lng: lng - 0.0029,
      description: "土地の暮らしや歴史を資料とともに紹介する施設です。",
      imageUrl: "https://commons.wikimedia.org/wiki/Special:Redirect/file/Tokyo%2C%20sumida%20hokusai%20museum%2C%20esterno%2001.jpg?width=900",
      imageAlt: "すみだ北斎美術館の外観（文化施設カテゴリのイメージ）",
      imageCredit: "Wikimedia Commons / Sailko（カテゴリイメージ）",
      imageSourceUrl: "https://commons.wikimedia.org/wiki/File:Tokyo,_sumida_hokusai_museum,_esterno_01.jpg",
    },
    {
      id: "fallback-4",
      name: "水辺の緑道",
      category: "公園・自然",
      lat: lat - 0.006,
      lng: lng - 0.0037,
      description: "季節の草木を眺めながら歩ける、静かな散策路です。",
      imageUrl: "https://commons.wikimedia.org/wiki/Special:Redirect/file/Hinokichou-Park-pond.jpg?width=900",
      imageAlt: "東京・檜町公園の池（公園カテゴリのイメージ）",
      imageCredit: "Wikimedia Commons / Momotarou2012（カテゴリイメージ）",
      imageSourceUrl: "https://commons.wikimedia.org/wiki/File:Hinokichou-Park-pond.jpg",
    },
  ];
  return candidates
    .map((spot) => ({ ...spot, distanceM: distanceBetween({ lat, lng }, spot) }))
    .sort((a, b) => a.distanceM - b.distanceM);
}
