export type GeoPoint = {
  lat: number;
  lng: number;
  timestamp: number;
  accuracy: number;
  altitude: number | null;
  breakBefore?: boolean;
};

export type WalkRecord = {
  id: string;
  startedAt: number;
  endedAt: number;
  durationMs: number;
  distanceM: number;
  cumulativeElevationM: number | null;
  points: GeoPoint[];
  isSample?: boolean;
};

export type ActiveWalk = {
  id: string;
  startedAt: number;
  points: GeoPoint[];
  distanceM: number;
  status: "recording" | "paused";
  pausedAt: number | null;
  totalPausedMs: number;
  isDemo?: boolean;
};

export type SpotCategory = "史跡" | "神社・寺" | "文化施設" | "歴史・文化" | "公園・自然";

export type ExploreSpot = {
  id: string;
  name: string;
  category: SpotCategory;
  lat: number;
  lng: number;
  distanceM: number;
  description: string;
};

export type CheckIn = {
  id: string;
  spotId: string;
  spotName: string;
  category: SpotCategory;
  checkedInAt: number;
  lat: number;
  lng: number;
  distanceFromCurrentM: number | null;
  walkId: string | null;
};
