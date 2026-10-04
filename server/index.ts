import "dotenv/config";
import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import rateLimit from "express-rate-limit";
import path from "node:path";
import { existsSync } from "node:fs";
import { z } from "zod";
import { AU_BOUNDS } from "../shared/regions";
import type { ClimateAnalysis } from "../shared/types";
import { RateLimitedError } from "./openMeteo";
import { analyseLocation, DataUnavailableError } from "./analysis";
import { AiUnavailableError, diagnosePhoto, explainResult } from "./gemini";

const PORT = Number(process.env.PORT ?? 8787);
const isProd = process.env.NODE_ENV === "production";

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(express.json({ limit: "8mb" })); // photos are downscaled client-side; analyses are ~100 kB

app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  next();
});

const climateLimiter = rateLimit({
  windowMs: 60_000,
  limit: 30,
  standardHeaders: "draft-8",
  legacyHeaders: false,
});
const aiLimiter = rateLimit({
  windowMs: 60_000,
  limit: 12,
  standardHeaders: "draft-8",
  legacyHeaders: false,
});

const coordsSchema = z.object({
  lat: z.coerce.number().min(AU_BOUNDS.latMin).max(AU_BOUNDS.latMax),
  lon: z.coerce.number().min(AU_BOUNDS.lonMin).max(AU_BOUNDS.lonMax),
  label: z.string().trim().max(80).optional(),
});

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    ai: Boolean(
      process.env.GEMINI_API_KEY &&
      process.env.GEMINI_API_KEY !== "MY_GEMINI_API_KEY",
    ),
  });
});

app.get("/api/climate", climateLimiter, async (req, res) => {
  const q = coordsSchema.safeParse(req.query);
  if (!q.success) {
    res.status(400).json({ error: "Pick a location inside Australia." });
    return;
  }
  // Round to ~1 km so nearby requests share the cache.
  const lat = Math.round(q.data.lat * 100) / 100;
  const lon = Math.round(q.data.lon * 100) / 100;
  const analysis = await analyseLocation(
    lat,
    lon,
    q.data.label ?? `${lat.toFixed(2)}, ${lon.toFixed(2)}`,
  );
  res.setHeader("Cache-Control", "public, max-age=86400");
  res.json(analysis);
});

/** Open-Meteo admin1 names for Australian states/territories. */
const AU_STATES = [
  "Victoria",
  "New South Wales",
  "Queensland",
  "South Australia",
  "Western Australia",
  "Tasmania",
  "Australian Capital Territory",
  "Northern Territory",
] as const;

const geocodeSchema = z.object({
  q: z.string().trim().min(2).max(80),
  state: z.enum(AU_STATES).optional(),
});

type GeocodeHit = {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  country_code?: string;
  admin1?: string;
  admin2?: string;
};

/** Address search via Open-Meteo Geocoding (Australia only; optional state filter). */
app.get("/api/geocode", climateLimiter, async (req, res) => {
  const q = geocodeSchema.safeParse(req.query);
  if (!q.success) {
    res.status(400).json({ error: "Type at least two characters." });
    return;
  }
  // Open-Meteo matches "name, admin1" exactly on the qualifier after the comma.
  const name = q.data.state ? `${q.data.q}, ${q.data.state}` : q.data.q;
  const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
  url.searchParams.set("name", name);
  url.searchParams.set("count", "10");
  url.searchParams.set("language", "en");
  url.searchParams.set("countryCode", "AU");

  let raw: { results?: GeocodeHit[] };
  try {
    const upstream = await fetch(url);
    if (!upstream.ok) throw new Error(`geocode ${upstream.status}`);
    raw = (await upstream.json()) as { results?: GeocodeHit[] };
  } catch {
    res.status(502).json({ error: "Place search is unavailable right now. Try again in a minute." });
    return;
  }

  const inBounds = (lat: number, lon: number) =>
    lat >= AU_BOUNDS.latMin &&
    lat <= AU_BOUNDS.latMax &&
    lon >= AU_BOUNDS.lonMin &&
    lon <= AU_BOUNDS.lonMax;

  const results = (raw.results ?? [])
    .filter((r) => inBounds(r.latitude, r.longitude))
    .filter((r) => !q.data.state || r.admin1 === q.data.state)
    .map((r) => {
      const parts = [r.name, r.admin2, r.admin1].filter(Boolean);
      return {
        id: r.id,
        name: r.name,
        label: parts.join(", "),
        lat: r.latitude,
        lon: r.longitude,
        admin1: r.admin1 ?? null,
      };
    });

  res.setHeader("Cache-Control", "public, max-age=3600");
  res.json({ results });
});

const verdictEnum = z.enum(["viable", "at-risk", "not-viable", "no-data"]);
const explainSchema = z.object({
  analysis: z.custom<ClimateAnalysis>(
    (v) =>
      typeof v === "object" &&
      v !== null &&
      (v as { schemaVersion?: number }).schemaVersion === 2,
  ),
  grownHere: z.array(z.string().max(120)).max(25).default([]),
  water: z
    .object({
      orchardIrrigationMlPerHa: z.number().nonnegative().nullable(),
      shortfallChangeMm: z.number(),
      extraMlPerHa: z.number(),
      extraShareOfToday: z.number().nullable(),
    })
    .nullable()
    .default(null),
  crops: z
    .array(
      z.object({
        id: z.string().max(60),
        label: z.string().max(120),
        overall: verdictEnum,
        heatNote: z.string().max(300),
        chillRequirement: z.number().min(0).max(3000).nullable(),
        chillPortionsRequirement: z.number().min(0).max(300).nullable(),
        portionsConverted: z.boolean(),
        seasons: z
          .array(
            z.object({
              season: z.enum(["winter", "spring", "summer"]),
              verdict: verdictEnum,
              baseline: z.number().nullable(),
              future: z.number().nullable(),
              threshold: z.number().nullable(),
              indicative: z.boolean(),
              margin: z.number().nullable().optional(),
            }),
          )
          .max(3),
      }),
    )
    .min(1)
    .max(25),
});

app.post("/api/explain", aiLimiter, async (req, res) => {
  const body = explainSchema.safeParse(req.body);
  if (!body.success) {
    res
      .status(400)
      .json({ error: "Run the analysis and pick at least one option first." });
    return;
  }
  const text = await explainResult(body.data.analysis, body.data.crops, body.data.grownHere, body.data.water);
  res.json({ text });
});

const diagnoseSchema = z.object({
  image: z.string().min(100).max(7_000_000),
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  crop: z.string().trim().max(60).optional(),
});

app.post("/api/diagnose", aiLimiter, async (req, res) => {
  const body = diagnoseSchema.safeParse(req.body);
  if (!body.success) {
    res
      .status(400)
      .json({ error: "Upload a JPEG, PNG or WebP photo under 5 MB." });
    return;
  }
  const diagnosis = await diagnosePhoto(
    body.data.image,
    body.data.mimeType,
    body.data.crop,
  );
  res.json(diagnosis);
});

app.use("/api", (_req, res) => {
  res.status(404).json({ error: "Not found" });
});

if (isProd) {
  const dist = path.resolve(process.cwd(), "dist");
  if (existsSync(dist)) {
    app.use(express.static(dist, { maxAge: "1h", index: false }));
    app.get(/^(?!\/api).*/, (_req, res) =>
      res.sendFile(path.join(dist, "index.html")),
    );
  }
}

// Express 5 forwards rejected promises from async handlers here.
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof AiUnavailableError) {
    res
      .status(503)
      .json({
        error: "AI features are switched off on this server (no Gemini key).",
      });
    return;
  }
  if (err instanceof DataUnavailableError) {
    res.status(422).json({ error: err.message });
    return;
  }
  if (err instanceof RateLimitedError) {
    const wait = { minute: "a minute", hour: "an hour", day: "a few hours" }[err.window];
    res
      .status(503)
      .setHeader("Retry-After", { minute: "60", hour: "3600", day: "14400" }[err.window])
      .json({
        error: `The free climate data service is busy, so new locations can't load right now. Try again in ${wait}. The preset districts still work.`,
      });
    return;
  }
  console.error("[api]", err);
  res
    .status(502)
    .json({
      error:
        "The climate or AI service did not respond. Try again in a minute.",
    });
});

const server = app.listen(PORT, () => {
  console.log(
    `Paddock API listening on http://localhost:${PORT}${isProd ? " (serving dist/)" : ""}`,
  );
});

// Hosting platforms (Cloud Run, Render, Fly) stop instances with SIGTERM: finish in-flight
// requests, then exit. Force-exit if anything hangs.
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    console.log(`${signal} received, shutting down`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref();
  });
}
