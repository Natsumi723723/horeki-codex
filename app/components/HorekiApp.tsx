"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Building2,
  ChevronLeft,
  ChevronRight,
  CircleStop,
  Clock3,
  Compass,
  Footprints,
  History,
  Landmark,
  Layers3,
  LoaderCircle,
  LocateFixed,
  Map as MapIcon,
  MapPin,
  Navigation,
  Pause,
  Play,
  Route,
  ShieldCheck,
  Signal,
  TreePine,
  WifiOff,
} from "lucide-react";
import HorekiMap from "./HorekiMap";
import { clearActiveWalk, getActiveWalk, getWalkRecords, saveActiveWalk, saveWalkRecord } from "../lib/db";
import {
  averageSpeed,
  calculateElevation,
  distanceBetween,
  evaluatePoint,
  formatClockDuration,
  formatDistance,
  formatDuration,
} from "../lib/geo";
import { fallbackSpots, SAMPLE_RECORDS } from "../lib/sample-data";
import type { ActiveWalk, ExploreSpot, GeoPoint, SpotCategory, WalkRecord } from "../types";

type Tab = "map" | "records" | "explore" | "my-map";
type GeoState = "idle" | "locating" | "ready" | "weak" | "denied" | "unavailable";

const TAB_ITEMS: { id: Tab; label: string; overline: string; icon: typeof MapIcon }[] = [
  { id: "map", label: "地図", overline: "MAP", icon: MapIcon },
  { id: "records", label: "記録", overline: "RECORD", icon: History },
  { id: "explore", label: "見つける", overline: "EXPLORE", icon: Compass },
  { id: "my-map", label: "私の地図", overline: "MY MAP", icon: Layers3 },
];

const CATEGORY_META: Record<SpotCategory, { icon: typeof Landmark; className: string }> = {
  史跡: { icon: Landmark, className: "historic" },
  "神社・寺": { icon: Navigation, className: "shrine" },
  文化施設: { icon: Building2, className: "culture" },
  "歴史・文化": { icon: MapPin, className: "heritage" },
  "公園・自然": { icon: TreePine, className: "nature" },
};

function toGeoPoint(position: GeolocationPosition): GeoPoint {
  return {
    lat: position.coords.latitude,
    lng: position.coords.longitude,
    timestamp: position.timestamp || Date.now(),
    accuracy: position.coords.accuracy,
    altitude: position.coords.altitude,
  };
}

function formatDate(timestamp: number, withYear = true) {
  return new Intl.DateTimeFormat("ja-JP", {
    year: withYear ? "numeric" : undefined,
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(timestamp);
}

function formatTime(timestamp: number) {
  return new Intl.DateTimeFormat("ja-JP", { hour: "2-digit", minute: "2-digit" }).format(timestamp);
}

function parseCategory(tags: Record<string, string>): SpotCategory {
  if (tags.amenity === "place_of_worship" || tags.building === "temple" || tags.building === "shrine") return "神社・寺";
  if (tags.historic) return "史跡";
  if (tags.tourism === "museum" || tags.amenity === "arts_centre") return "文化施設";
  if (tags.leisure === "park" || tags.natural) return "公園・自然";
  return "歴史・文化";
}

function spotDescription(tags: Record<string, string>, category: SpotCategory) {
  if (tags.description) return tags.description.slice(0, 100);
  if (tags["description:ja"]) return tags["description:ja"].slice(0, 100);
  const defaults: Record<SpotCategory, string> = {
    史跡: "土地の歴史を今に伝える、街歩きで立ち寄りたい場所です。",
    "神社・寺": "地域の時間が静かに積み重なる、身近な社寺です。",
    文化施設: "地域の文化や物語に触れられる施設です。",
    "歴史・文化": "街の記憶や文化を感じられるスポットです。",
    "公園・自然": "季節の景色を楽しみながら歩ける場所です。",
  };
  return defaults[category];
}

async function fetchNearbySpots(point: GeoPoint): Promise<ExploreSpot[]> {
  const query = `[out:json][timeout:18];(
    nwr(around:3000,${point.lat},${point.lng})[historic];
    nwr(around:3000,${point.lat},${point.lng})[amenity=place_of_worship];
    nwr(around:3000,${point.lat},${point.lng})[tourism=museum];
    nwr(around:3000,${point.lat},${point.lng})[amenity=arts_centre];
    nwr(around:3000,${point.lat},${point.lng})[leisure=park];
  );out center tags 60;`;
  const response = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
    body: new URLSearchParams({ data: query }),
  });
  if (!response.ok) throw new Error("Spot search failed");
  const data = (await response.json()) as {
    elements: { id: number; type: string; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> }[];
  };
  const seen = new Set<string>();
  return data.elements
    .flatMap((element) => {
      const lat = element.lat ?? element.center?.lat;
      const lng = element.lon ?? element.center?.lon;
      const tags = element.tags ?? {};
      const name = tags["name:ja"] ?? tags.name;
      if (!lat || !lng || !name || seen.has(name)) return [];
      seen.add(name);
      const category = parseCategory(tags);
      return [{
        id: `${element.type}-${element.id}`,
        name,
        category,
        lat,
        lng,
        distanceM: distanceBetween(point, { lat, lng }),
        description: spotDescription(tags, category),
      } satisfies ExploreSpot];
    })
    .sort((a, b) => a.distanceM - b.distanceM)
    .slice(0, 24);
}

function BrandMark() {
  return (
    <div className="brand-mark" aria-label="歩歴">
      <span className="brand-seal">歩</span>
      <span><b>歩歴</b><small>HOREKI</small></span>
    </div>
  );
}

function EmptyState({ icon: Icon, title, children }: { icon: typeof Route; title: string; children: React.ReactNode }) {
  return (
    <div className="empty-state">
      <span className="empty-icon"><Icon size={24} /></span>
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}

export default function HorekiApp() {
  const [tab, setTab] = useState<Tab>("map");
  const [records, setRecords] = useState<WalkRecord[]>([]);
  const [recordsLoaded, setRecordsLoaded] = useState(false);
  const [activeWalk, setActiveWalk] = useState<ActiveWalk | null>(null);
  const [currentPosition, setCurrentPosition] = useState<GeoPoint | null>(null);
  const [geoState, setGeoState] = useState<GeoState>("idle");
  const [now, setNow] = useState(Date.now());
  const [selectedRecord, setSelectedRecord] = useState<WalkRecord | null>(null);
  const [spots, setSpots] = useState<ExploreSpot[]>([]);
  const [spotsLoading, setSpotsLoading] = useState(false);
  const [spotsOffline, setSpotsOffline] = useState(false);
  const [selectedSpot, setSelectedSpot] = useState<ExploreSpot | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const recordingEnabledRef = useRef(false);
  const forceBreakRef = useRef(false);
  const wakeLockRef = useRef<{ release: () => Promise<void> } | null>(null);

  const shownRecords = recordsLoaded && records.length === 0 ? SAMPLE_RECORDS : records;
  const isShowingSamples = recordsLoaded && records.length === 0;

  useEffect(() => {
    async function hydrate() {
      try {
        const [storedRecords, storedActive] = await Promise.all([getWalkRecords(), getActiveWalk()]);
        setRecords(storedRecords);
        if (storedActive) {
          const restored = {
            ...storedActive,
            status: "paused" as const,
            pausedAt: storedActive.pausedAt ?? Date.now(),
          };
          setActiveWalk(restored);
          await saveActiveWalk(restored);
          setToast("途中の歩行記録を一時停止で復元しました");
        }
      } catch {
        setToast("端末内の記録を読み込めませんでした");
      } finally {
        setRecordsLoaded(true);
      }
    }
    void hydrate();
    if ("serviceWorker" in navigator && window.location.protocol === "https:") {
      void navigator.serviceWorker.register("/sw.js");
    }
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const stopWatching = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    void wakeLockRef.current?.release().catch(() => undefined);
    wakeLockRef.current = null;
  }, []);

  useEffect(() => () => stopWatching(), [stopWatching]);

  const onGeoError = useCallback((error: GeolocationPositionError) => {
    if (error.code === error.PERMISSION_DENIED) setGeoState("denied");
    else setGeoState("unavailable");
    if (recordingEnabledRef.current) setToast("GPS信号を確認できません。記録は終了せず待機しています");
  }, []);

  const handlePosition = useCallback((position: GeolocationPosition) => {
    const point = toGeoPoint(position);
    setCurrentPosition(point);
    setGeoState(point.accuracy > 50 ? "weak" : "ready");
    if (!recordingEnabledRef.current) return;

    setActiveWalk((previousWalk) => {
      if (!previousWalk || previousWalk.status !== "recording") return previousWalk;
      const previousPoint = previousWalk.points.at(-1);
      const decision = evaluatePoint(previousPoint, point);
      if (!decision.accept) return previousWalk;
      const acceptedPoint = { ...point, breakBefore: forceBreakRef.current || decision.breakBefore };
      const updated = {
        ...previousWalk,
        points: [...previousWalk.points, acceptedPoint],
        distanceM: previousWalk.distanceM + (forceBreakRef.current ? 0 : decision.distanceM),
      };
      forceBreakRef.current = false;
      void saveActiveWalk(updated);
      return updated;
    });
  }, []);

  const beginWatching = useCallback(async (recording: boolean) => {
    if (!("geolocation" in navigator)) {
      setGeoState("unavailable");
      return false;
    }
    stopWatching();
    setGeoState("locating");
    recordingEnabledRef.current = recording;
    if (recording && "wakeLock" in navigator) {
      try {
        const wakeLockNavigator = navigator as Navigator & { wakeLock: { request: (type: "screen") => Promise<{ release: () => Promise<void> }> } };
        wakeLockRef.current = await wakeLockNavigator.wakeLock.request("screen");
      } catch {
        // Wake Lock is a best-effort enhancement. GPS recording continues without it.
      }
    }
    watchIdRef.current = navigator.geolocation.watchPosition(handlePosition, onGeoError, {
      enableHighAccuracy: true,
      maximumAge: 5_000,
      timeout: 15_000,
    });
    return true;
  }, [handlePosition, onGeoError, stopWatching]);

  const locateOnce = () => {
    recordingEnabledRef.current = false;
    void beginWatching(false);
  };

  const startWalk = async () => {
    const startedAt = Date.now();
    const walk: ActiveWalk = {
      id: crypto.randomUUID(),
      startedAt,
      points: [],
      distanceM: 0,
      status: "recording",
      pausedAt: null,
      totalPausedMs: 0,
    };
    setActiveWalk(walk);
    await saveActiveWalk(walk);
    const started = await beginWatching(true);
    if (!started) {
      const paused = { ...walk, status: "paused" as const, pausedAt: Date.now() };
      setActiveWalk(paused);
      await saveActiveWalk(paused);
    }
  };

  const startDemo = () => {
    stopWatching();
    recordingEnabledRef.current = false;
    const startedAt = Date.now() - 46 * 60_000;
    const firstPoint = {
      ...SAMPLE_RECORDS[0].points[0],
      timestamp: startedAt,
      breakBefore: true,
    };
    setCurrentPosition(firstPoint);
    setGeoState("idle");
    setActiveWalk({
      id: `demo-${Date.now()}`,
      startedAt,
      points: [firstPoint],
      distanceM: 0,
      status: "recording",
      pausedAt: null,
      totalPausedMs: 0,
      isDemo: true,
    });
    setToast("GPSを使わず、サンプルの街歩きを再生します");
  };

  const pauseWalk = async () => {
    if (!activeWalk || activeWalk.status !== "recording") return;
    stopWatching();
    recordingEnabledRef.current = false;
    const paused = { ...activeWalk, status: "paused" as const, pausedAt: Date.now() };
    setActiveWalk(paused);
    if (!activeWalk.isDemo) await saveActiveWalk(paused);
  };

  const resumeWalk = async () => {
    if (!activeWalk || activeWalk.status !== "paused") return;
    const resumed = {
      ...activeWalk,
      status: "recording" as const,
      totalPausedMs: activeWalk.totalPausedMs + (activeWalk.pausedAt ? Date.now() - activeWalk.pausedAt : 0),
      pausedAt: null,
    };
    forceBreakRef.current = true;
    setActiveWalk(resumed);
    if (!activeWalk.isDemo) {
      await saveActiveWalk(resumed);
      void beginWatching(true);
    }
  };

  const finishWalk = async () => {
    if (!activeWalk) return;
    stopWatching();
    recordingEnabledRef.current = false;
    const endedAt = Date.now();
    const currentPauseMs = activeWalk.status === "paused" && activeWalk.pausedAt ? endedAt - activeWalk.pausedAt : 0;
    const record: WalkRecord = {
      id: activeWalk.id,
      startedAt: activeWalk.startedAt,
      endedAt,
      durationMs: Math.max(0, endedAt - activeWalk.startedAt - activeWalk.totalPausedMs - currentPauseMs),
      distanceM: activeWalk.distanceM,
      cumulativeElevationM: calculateElevation(activeWalk.points),
      points: activeWalk.points,
      isSample: activeWalk.isDemo,
    };
    if (activeWalk.isDemo) {
      setActiveWalk(null);
      setCurrentPosition(null);
      setSelectedRecord(record);
      setTab("records");
      setToast("デモ記録の詳細を表示しました。実際の記録には保存していません");
      return;
    }
    try {
      await saveWalkRecord(record);
      await clearActiveWalk();
      setRecords((previous) => [record, ...previous]);
      setActiveWalk(null);
      setToast("今日の街歩きを端末に保存しました");
      setSelectedRecord(record);
      setTab("records");
    } catch {
      setToast("保存できませんでした。もう一度お試しください");
    }
  };

  const activeDuration = activeWalk
    ? now - activeWalk.startedAt - activeWalk.totalPausedMs - (activeWalk.status === "paused" && activeWalk.pausedAt ? now - activeWalk.pausedAt : 0)
    : 0;

  const demoComplete = Boolean(
    activeWalk?.isDemo && activeWalk.points.length >= SAMPLE_RECORDS[0].points.length,
  );

  useEffect(() => {
    if (!activeWalk?.isDemo || activeWalk.status !== "recording") return;
    const timer = window.setTimeout(() => {
      setActiveWalk((previous) => {
        if (!previous?.isDemo || previous.status !== "recording") return previous;
        const nextIndex = previous.points.length;
        if (nextIndex >= SAMPLE_RECORDS[0].points.length) {
          return { ...previous, status: "paused", pausedAt: Date.now() };
        }
        const sourcePoint = SAMPLE_RECORDS[0].points[nextIndex];
        const nextPoint: GeoPoint = {
          ...sourcePoint,
          timestamp: previous.startedAt + nextIndex * 6 * 60_000,
          breakBefore: false,
        };
        const lastPoint = previous.points.at(-1)!;
        setCurrentPosition(nextPoint);
        return {
          ...previous,
          points: [...previous.points, nextPoint],
          distanceM: previous.distanceM + distanceBetween(lastPoint, nextPoint),
        };
      });
    }, 720);
    return () => window.clearTimeout(timer);
  }, [activeWalk?.isDemo, activeWalk?.status, activeWalk?.points.length]);

  const cumulative = useMemo(() => records.reduce((sum, record) => sum + record.distanceM, 0), [records]);
  const walkedDays = useMemo(() => new Set(records.map((record) => new Date(record.startedAt).toDateString())).size, [records]);

  const loadSpots = useCallback(async () => {
    if (!currentPosition) return;
    setSpotsLoading(true);
    setSpotsOffline(false);
    try {
      const results = await fetchNearbySpots(currentPosition);
      if (results.length === 0) throw new Error("No spots");
      setSpots(results);
    } catch {
      setSpots(fallbackSpots(currentPosition.lat, currentPosition.lng));
      setSpotsOffline(true);
    } finally {
      setSpotsLoading(false);
    }
  }, [currentPosition]);

  useEffect(() => {
    if (tab === "explore" && currentPosition && spots.length === 0 && !spotsLoading) void loadSpots();
  }, [tab, currentPosition, spots.length, spotsLoading, loadSpots]);

  const openSpot = (spot: ExploreSpot) => {
    setSelectedSpot(spot);
    window.setTimeout(() => document.getElementById(`spot-${spot.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 80);
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <BrandMark />
        <div className="topbar-actions">
          <span className="privacy-chip"><ShieldCheck size={15} /> 記録はこの端末だけ</span>
          {geoState === "ready" && <span className="signal-chip good"><Signal size={14} /> GPS 良好</span>}
          {geoState === "weak" && <span className="signal-chip weak"><Signal size={14} /> GPS 弱</span>}
        </div>
      </header>

      <section className="app-content">
        {tab === "map" && (
          <div className="map-screen">
            <div className="full-map">
              <HorekiMap
                currentPosition={currentPosition}
                routes={activeWalk?.points.length ? [{ points: activeWalk.points }] : []}
                followCurrent={Boolean(activeWalk)}
              />
              <div className="map-title-card">
                <small>{activeWalk?.isDemo ? "DEMO WALK" : activeWalk ? "NOW WALKING" : "TODAY'S MAP"}</small>
                <strong>{activeWalk?.isDemo ? "デモ散歩" : activeWalk ? "歩行中" : "今日の街を歩こう"}</strong>
                <span>{activeWalk ? formatDate(activeWalk.startedAt, false) : "歩いた線が、あなたの地図になる"}</span>
              </div>
              <button className="locate-button" type="button" onClick={locateOnce} aria-label="現在地を表示">
                <LocateFixed size={22} />
              </button>
              {geoState === "weak" && <div className="gps-notice"><Signal size={16} /> GPS信号が弱くなっています</div>}
              {geoState === "denied" && <div className="gps-notice error"><MapPin size={16} /> 位置情報の許可が必要です</div>}
            </div>

            <div className={`record-panel ${activeWalk ? "is-active" : ""}`}>
              {activeWalk ? (
                <>
                  <div className="recording-status">
                    <span className={activeWalk.status === "recording" ? "live-dot" : "pause-dot"} />
                    <span>{activeWalk.isDemo
                      ? demoComplete ? "デモルートを歩き終えました" : activeWalk.status === "recording" ? "サンプルの街歩きを再生しています" : "デモを一時停止しています"
                      : activeWalk.status === "recording" ? "GPSで歩行を記録しています" : "記録を一時停止しています"}</span>
                  </div>
                  <div className="live-stats">
                    <div><small>距離</small><strong>{formatDistance(activeWalk.distanceM)}</strong></div>
                    <div><small>歩行時間</small><strong>{formatClockDuration(activeDuration)}</strong></div>
                    <div><small>取得地点</small><strong>{activeWalk.points.length}<em>点</em></strong></div>
                  </div>
                  <div className="record-controls">
                    {demoComplete ? (
                      <button className="secondary-action" type="button" onClick={startDemo}><Play size={19} fill="currentColor" /> もう一度</button>
                    ) : activeWalk.status === "recording" ? (
                      <button className="secondary-action" type="button" onClick={pauseWalk}><Pause size={19} /> 一時停止</button>
                    ) : (
                      <button className="primary-action compact-action" type="button" onClick={resumeWalk}><Play size={19} fill="currentColor" /> 再開</button>
                    )}
                    <button className="finish-action" type="button" onClick={finishWalk}><CircleStop size={19} /> {activeWalk.isDemo ? "デモの詳細を見る" : "終了して保存"}</button>
                  </div>
                </>
              ) : (
                <>
                  <div className="start-copy">
                    <div><small>GPS WALK LOG</small><h1>今日の一歩を、<br />街の記憶に。</h1></div>
                    <Footprints className="footprint-mark" size={44} strokeWidth={1.4} />
                  </div>
                  <button className="primary-action start-action" type="button" onClick={startWalk}>
                    <span className="play-disc"><Play size={20} fill="currentColor" /></span>
                    歩き始める
                  </button>
                  <button className="demo-action" type="button" onClick={startDemo}>
                    <Route size={18} /> デモ散歩を見る <small>GPS不要</small>
                  </button>
                  <p className="record-hint">開始すると位置情報を確認します。通信がなくても記録できます。</p>
                </>
              )}
            </div>
          </div>
        )}

        {tab === "records" && (
          <div className="page-view">
            {selectedRecord ? (
              <RecordDetail record={selectedRecord} onBack={() => setSelectedRecord(null)} />
            ) : (
              <>
                <PageHeading eyebrow="WALK RECORD" title="歩いた日を、振り返る。" description="新しい街歩きから順に記録しています。" />
                {isShowingSamples && <div className="sample-note">まだ記録がないため、表示イメージをサンプルで紹介しています。</div>}
                <div className="record-list">
                  {shownRecords.map((record) => (
                    <button className="record-card" type="button" key={record.id} onClick={() => setSelectedRecord(record)}>
                      <div className="record-card-map"><HorekiMap routes={[{ points: record.points }]} compact /></div>
                      <div className="record-card-content">
                        <div className="record-date"><span>{formatDate(record.startedAt)}</span>{record.isSample && <em>サンプル</em>}</div>
                        <strong>{formatDistance(record.distanceM)}</strong>
                        <div className="record-meta"><span><Clock3 size={15} /> {formatDuration(record.durationMs)}</span><span>{formatTime(record.startedAt)} 出発</span></div>
                      </div>
                      <ChevronRight className="record-chevron" size={21} />
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {tab === "explore" && (
          <div className="page-view explore-view">
            <PageHeading eyebrow="NEARBY STORIES" title="寄り道で、街を知る。" description="史跡や社寺、文化施設を近い順に見つけます。" />
            {!currentPosition ? (
              <div className="explore-permission">
                <EmptyState icon={MapPin} title="現在地から探します">位置情報はスポットとの距離計算にだけ使用します。</EmptyState>
                <button className="primary-action inline-action" type="button" onClick={locateOnce}><LocateFixed size={19} /> 現在地を確認</button>
              </div>
            ) : (
              <>
                <div className="explore-map-wrap">
                  <HorekiMap currentPosition={currentPosition} spots={spots} selectedSpotId={selectedSpot?.id} onSpotSelect={openSpot} />
                  <button type="button" className="refresh-spots" onClick={loadSpots} disabled={spotsLoading}>
                    {spotsLoading ? <LoaderCircle size={17} className="spin" /> : <LocateFixed size={17} />} この周辺を検索
                  </button>
                </div>
                {spotsOffline && <div className="offline-note"><WifiOff size={16} /> オフラインのため、周辺スポットはサンプル表示です。</div>}
                <div className="category-strip" aria-label="スポットカテゴリ">
                  {(["史跡", "神社・寺", "文化施設", "公園・自然"] as SpotCategory[]).map((category) => {
                    const Icon = CATEGORY_META[category].icon;
                    return <span key={category}><Icon size={15} /> {category}</span>;
                  })}
                </div>
                <div className="spot-list">
                  {spotsLoading && spots.length === 0 && [0, 1, 2].map((item) => <div className="spot-skeleton" key={item} />)}
                  {spots.map((spot) => {
                    const meta = CATEGORY_META[spot.category];
                    const Icon = meta.icon;
                    return (
                      <button
                        id={`spot-${spot.id}`}
                        className={`spot-card ${selectedSpot?.id === spot.id ? "selected" : ""}`}
                        type="button"
                        key={spot.id}
                        onClick={() => openSpot(spot)}
                      >
                        <span className={`spot-icon ${meta.className}`}><Icon size={21} /></span>
                        <span className="spot-copy"><small>{spot.category}</small><strong>{spot.name}</strong><em>{spot.description}</em></span>
                        <span className="spot-distance">{formatDistance(spot.distanceM)}<small>徒歩圏内</small></span>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}

        {tab === "my-map" && (
          <div className="my-map-view">
            <div className="my-map-heading">
              <PageHeading eyebrow="MY WALKING MAP" title="歩いた街が、積み重なる。" description="これまでの軌跡を一枚の地図に重ねています。" />
              {isShowingSamples && <span className="sample-badge">サンプル表示</span>}
            </div>
            <div className="my-map-canvas">
              <HorekiMap routes={shownRecords.map((record) => ({ points: record.points, muted: true }))} />
            </div>
            <div className="cumulative-panel">
              <div className="cumulative-main"><small>累計歩行距離</small><strong>{formatDistance(records.length ? cumulative : SAMPLE_RECORDS.reduce((sum, item) => sum + item.distanceM, 0))}</strong></div>
              <div className="cumulative-sub"><div><small>歩行記録</small><strong>{records.length || SAMPLE_RECORDS.length}<em>回</em></strong></div><div><small>歩いた日数</small><strong>{records.length ? walkedDays : 2}<em>日</em></strong></div></div>
              {isShowingSamples && <p>最初の街歩きを保存すると、ここがあなた自身の地図に変わります。</p>}
            </div>
          </div>
        )}
      </section>

      <nav className="bottom-nav" aria-label="メインメニュー">
        {TAB_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              className={tab === item.id ? "active" : ""}
              type="button"
              onClick={() => { setTab(item.id); setSelectedRecord(null); }}
              aria-current={tab === item.id ? "page" : undefined}
            >
              <Icon size={21} /><span>{item.label}<small>{item.overline}</small></span>
            </button>
          );
        })}
      </nav>
      {toast && <div className="toast" role="status">{toast}</div>}
    </main>
  );
}

function PageHeading({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return (
    <div className="page-heading"><small>{eyebrow}</small><h1>{title}</h1><p>{description}</p></div>
  );
}

function RecordDetail({ record, onBack }: { record: WalkRecord; onBack: () => void }) {
  return (
    <div className="record-detail">
      <button className="back-button" type="button" onClick={onBack}><ChevronLeft size={20} /> 記録一覧へ</button>
      <div className="detail-heading"><small>WALK LOG</small><h1>{formatDate(record.startedAt)}の街歩き</h1><p>{formatTime(record.startedAt)} – {formatTime(record.endedAt)}</p></div>
      <div className="detail-map"><HorekiMap routes={[{ points: record.points }]} /></div>
      <div className="detail-stats">
        <div className="hero-stat"><small>歩行距離</small><strong>{formatDistance(record.distanceM)}</strong></div>
        <div><Clock3 size={18} /><small>歩行時間</small><strong>{formatDuration(record.durationMs)}</strong></div>
        <div><Navigation size={18} /><small>平均速度</small><strong>{averageSpeed(record)} <em>km/h</em></strong></div>
        <div><Layers3 size={18} /><small>累積標高</small><strong>{record.cumulativeElevationM === null ? "—" : `${Math.round(record.cumulativeElevationM)} m`}</strong></div>
      </div>
      {record.isSample && <div className="sample-note">これは表示イメージ用のサンプル記録です。</div>}
    </div>
  );
}
