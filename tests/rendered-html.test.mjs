import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the Horeki GPS walking app shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<html lang="ja">/);
  assert.match(html, /<title>歩歴（ほれき）｜歩いた街が、あなたの地図になる<\/title>/);
  assert.match(html, /歩き始める/);
  assert.match(html, /デモ散歩を見る/);
  assert.match(html, /記録はこの端末だけ/);
  assert.match(html, /aria-label="メインメニュー"/);
  assert.match(html, /MY MAP/);
  assert.match(html, /rel="manifest" href="\/manifest\.webmanifest"/);
  assert.match(html, /property="og:image"/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/);
});

test("keeps GPS filtering and device-local persistence in the product source", async () => {
  const [app, geo, database, layout, packageJson] = await Promise.all([
    readFile(new URL("../app/components/HorekiApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/geo.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/db.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(app, /watchPosition/);
  assert.match(app, /enableHighAccuracy:\s*true/);
  assert.match(app, /saveActiveWalk/);
  assert.match(app, /clearActiveWalk/);
  assert.match(app, /overpass-api\.de/);
  assert.match(app, /startDemo/);
  assert.match(app, /GPS不要/);
  assert.match(app, /isSample:\s*activeWalk\.isDemo/);
  assert.match(app, /この場所にチェックイン/);
  assert.match(app, /saveCheckIn/);
  assert.match(app, /サンプルスポットで見る/);
  assert.match(app, /createSampleCheckIns/);
  assert.match(app, /wikipediaImage/);
  assert.match(app, /wikimedia_commons/);
  assert.match(app, /loading="lazy"/);
  assert.match(app, /spot-detail-photo/);
  assert.match(app, /CHECK-IN TIMELINE/);
  assert.match(app, /チェックインのタイムライン/);
  assert.match(app, /日付で区切らず新しい順/);
  assert.match(app, /単独チェックイン/);
  assert.match(app, /TimelinePhoto/);
  assert.match(app, /imageUrl:\s*selectedSpot\.imageUrl/);
  assert.doesNotMatch(app, /className="map-title-card"/);
  assert.match(app, /推定歩数/);
  assert.match(app, /stepCount:\s*estimateSteps/);
  assert.match(app, /deploymentAssetSignature/);
  assert.match(app, /UPDATE_POLL_MS = 60_000/);
  assert.match(app, /visibilitychange/);
  assert.match(app, /歩行終了後に自動更新します/);
  assert.match(app, /cache:\s*"no-store"/);
  assert.match(geo, /candidate\.accuracy > 80/);
  assert.match(geo, /speedMps > 4\.5/);
  assert.match(geo, /distanceM > 250/);
  assert.match(geo, /EARTH_RADIUS_M/);
  assert.match(geo, /AVERAGE_STRIDE_M = 0\.72/);
  assert.match(geo, /estimateSteps/);
  assert.match(database, /indexedDB\.open/);
  assert.match(database, /walkRecords/);
  assert.match(database, /checkIns/);
  assert.match(database, /DB_VERSION = 2/);
  assert.match(layout, /og\.png/);
  assert.match(packageJson, /"leaflet"/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
});
