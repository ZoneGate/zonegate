"use client";

/**
 * The geofence a decision was actually checked against, on a real map.
 *
 * Tiles come straight from OpenStreetMap over the slippy-map convention, so
 * there is no mapping library in the bundle and nothing to initialise against
 * the DOM — which also means it renders the same on the server and the client.
 *
 * What is drawn is the circle the evidence gateway asked the carrier about:
 * the zone centre and its radius in metres, from `/v1/policy/zones`. When the
 * zone of a decision is not in the registry there is nothing honest to draw,
 * and the caller is told so rather than shown a plausible-looking pin.
 */

const TILE_SIZE = 256;

/** How many tiles wide the rendered map is. Odd, so the zone sits centred. */
const COLUMNS = 3;
const ROWS = 2;

export type ZoneMapProps = {
    latitude: number;
    longitude: number;
    radiusMeters: number;
    label: string;
    /** True when the carrier placed the device inside this circle. */
    verified: boolean | null;
};

/** Web-mercator pixel coordinates of a position at a given zoom. */
function project(latitude: number, longitude: number, zoom: number) {
    const scale = TILE_SIZE * 2 ** zoom;
    const sinLat = Math.sin((latitude * Math.PI) / 180);

    return {
        x: ((longitude + 180) / 360) * scale,
        y:
            (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) *
            scale,
    };
}

/**
 * Metres per pixel at this latitude and zoom.
 *
 * Mercator stretches with latitude, so a radius drawn with the equatorial
 * figure would be visibly wrong anywhere but the equator.
 */
function metresPerPixel(latitude: number, zoom: number) {
    return (
        (156543.03392 * Math.cos((latitude * Math.PI) / 180)) / 2 ** zoom
    );
}

/** The zoom at which the whole circle, plus margin, fits the rendered box. */
function fittingZoom(latitude: number, radiusMeters: number) {
    const heightPx = ROWS * TILE_SIZE;

    for (let zoom = 17; zoom > 3; zoom -= 1) {
        const diameterPx = (2 * radiusMeters) / metresPerPixel(latitude, zoom);
        if (diameterPx * 1.6 <= heightPx) return zoom;
    }

    return 4;
}

export default function ZoneMap({
    latitude,
    longitude,
    radiusMeters,
    label,
    verified,
}: ZoneMapProps) {
    const zoom = fittingZoom(latitude, radiusMeters);
    const centre = project(latitude, longitude, zoom);

    const width = COLUMNS * TILE_SIZE;
    const height = ROWS * TILE_SIZE;

    // The tile grid is laid out so the zone centre lands in the middle of the
    // box; `offset` is how far the grid's top-left corner sits from it.
    const originX = centre.x - width / 2;
    const originY = centre.y - height / 2;

    const firstTileX = Math.floor(originX / TILE_SIZE);
    const firstTileY = Math.floor(originY / TILE_SIZE);
    const shiftX = firstTileX * TILE_SIZE - originX;
    const shiftY = firstTileY * TILE_SIZE - originY;

    const radiusPx = radiusMeters / metresPerPixel(latitude, zoom);
    const maxTile = 2 ** zoom;

    const tiles = [];
    for (let row = 0; row <= ROWS; row += 1) {
        for (let column = 0; column <= COLUMNS; column += 1) {
            const tileX = firstTileX + column;
            const tileY = firstTileY + row;

            // Off the top or bottom of the world; the sides wrap.
            if (tileY < 0 || tileY >= maxTile) continue;

            tiles.push({
                key: `${tileX}-${tileY}`,
                left: shiftX + column * TILE_SIZE,
                top: shiftY + row * TILE_SIZE,
                url: `https://tile.openstreetmap.org/${zoom}/${
                    ((tileX % maxTile) + maxTile) % maxTile
                }/${tileY}.png`,
            });
        }
    }

    const ring = verified === false ? "#DC2626" : verified === true ? "#0D9488" : "#94A3B8";

    return (
        <div>
            <div
                className="relative overflow-hidden rounded-md border border-[#E2E8F0] bg-[#E8EDF2]"
                style={{ height }}
                role="img"
                aria-label={`Map of ${label}, a ${radiusMeters} metre geofence centred on ${latitude}, ${longitude}`}
            >
                {tiles.map((tile) => (
                    // Plain <img>: these are third-party raster tiles at a fixed
                    // 256px, so the Next image pipeline has nothing to add.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                        key={tile.key}
                        src={tile.url}
                        alt=""
                        width={TILE_SIZE}
                        height={TILE_SIZE}
                        loading="lazy"
                        className="absolute max-w-none select-none"
                        style={{ left: tile.left, top: tile.top }}
                    />
                ))}

                {/* The geofence, to scale at this zoom. */}
                <div
                    className="pointer-events-none absolute rounded-full"
                    style={{
                        left: width / 2 - radiusPx,
                        top: height / 2 - radiusPx,
                        width: radiusPx * 2,
                        height: radiusPx * 2,
                        border: `2px solid ${ring}`,
                        backgroundColor: `${ring}22`,
                    }}
                />

                <div
                    className="pointer-events-none absolute h-2.5 w-2.5 rounded-full ring-2 ring-white"
                    style={{
                        left: width / 2 - 5,
                        top: height / 2 - 5,
                        backgroundColor: ring,
                    }}
                />

                <p className="pointer-events-none absolute bottom-0 right-0 bg-white/80 px-1.5 py-0.5 text-[9px] text-[#475569]">
                    © OpenStreetMap contributors
                </p>
            </div>

            <p className="mt-2 font-mono text-[10px] leading-relaxed text-[#64748B]">
                {label} · {latitude.toFixed(4)}, {longitude.toFixed(4)} ·{" "}
                {radiusMeters} m radius
            </p>

            <p className="mt-1 text-[11px] leading-relaxed text-[#94A3B8]">
                {verified === true
                    ? "The carrier placed the bound device inside this circle."
                    : verified === false
                      ? "The carrier placed the bound device outside this circle."
                      : "Location was not collected for this decision, so the device is not placed."}
            </p>
        </div>
    );
}
