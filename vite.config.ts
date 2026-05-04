import { defineConfig, loadEnv, type Plugin, type ViteDevServer } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";

import { applyLocalityHint } from "./src/lib/parsePrediction";

/** Dev-only proxy for Places New API; key stays server-side. */
function placesApiPlugin(apiKey: string | undefined): Plugin {
  return {
    name: "felix-places-api",
    configureServer(server: ViteDevServer) {
      server.middlewares.use("/api/places/autocomplete", async (req, res) => {
        await handleAutocomplete(req, res, apiKey);
      });
      server.middlewares.use("/api/places/details", async (req, res) => {
        await handleDetails(req, res, apiKey);
      });
    },
  };
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

type AutocompleteJson = {
  suggestions?: Array<{
    placePrediction?: {
      placeId: string;
      text?: { text?: string };
      structuredFormat?: {
        mainText?: { text?: string };
        secondaryText?: { text?: string };
      };
      types?: string[];
    };
  }>;
};

type NormalizedSuggestion = {
  placeId: string;
  mainText: string;
  secondaryText: string;
  description: string;
  types: string[];
};

function normalizeAutocompletePredictions(json: AutocompleteJson): NormalizedSuggestion[] {
  return (json.suggestions ?? [])
    .map((s) => s.placePrediction)
    .filter((p): p is NonNullable<typeof p> => Boolean(p))
    .map((p) => ({
      placeId: p.placeId,
      mainText: p.structuredFormat?.mainText?.text ?? p.text?.text ?? "",
      secondaryText: p.structuredFormat?.secondaryText?.text ?? "",
      description: p.text?.text ?? "",
      types: p.types ?? [],
    }));
}

function mergeByPlaceId(primary: NormalizedSuggestion[], secondary: NormalizedSuggestion[]) {
  const seen = new Set<string>();
  const out: NormalizedSuggestion[] = [];
  for (const s of primary) {
    if (seen.has(s.placeId)) continue;
    seen.add(s.placeId);
    out.push(s);
  }
  for (const s of secondary) {
    if (seen.has(s.placeId)) continue;
    seen.add(s.placeId);
    out.push(s);
  }
  return out;
}

async function postPlacesAutocomplete(
  apiKey: string,
  body: Record<string, unknown>,
): Promise<AutocompleteJson> {
  const upstream = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
    },
    body: JSON.stringify(body),
  });
  if (!upstream.ok) {
    const text = await upstream.text().catch(() => "");
    const err = new Error(text.slice(0, 500)) as Error & { status?: number };
    err.status = upstream.status;
    throw err;
  }
  return (await upstream.json()) as AutocompleteJson;
}

async function handleAutocomplete(
  req: IncomingMessage,
  res: ServerResponse,
  apiKey: string | undefined,
) {
  if (!apiKey) {
    return send(res, 503, {
      error: "places provider not configured — set GOOGLE_MAPS_API_KEY in .env.local",
    });
  }
  const url = new URL(req.url ?? "/", "http://x");
  const q = url.searchParams.get("q") ?? "";
  if (!q || q.length > 200) return send(res, 400, { error: "invalid query" });
  const sessionToken = url.searchParams.get("sessionToken") ?? undefined;
  const regions = url.searchParams.get("regions") ?? "us";
  const includeAdminAreas = url.searchParams.get("includeAdminAreas") === "1";

  const includedRegionCodes = regions
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => /^[a-z]{2}$/.test(s));
  const regionCode = includedRegionCodes[0] ?? "us";

  const baseBody: Record<string, unknown> = {
    input: q,
    languageCode: "en",
    regionCode,
    includedRegionCodes,
  };
  if (sessionToken) baseBody.sessionToken = sessionToken;

  try {
    const settled = await Promise.allSettled([
      postPlacesAutocomplete(apiKey, baseBody),
      includeAdminAreas
        ? postPlacesAutocomplete(apiKey, {
            ...baseBody,
            includedPrimaryTypes: ["administrative_area_level_1"],
          })
        : Promise.resolve({ suggestions: [] } as AutocompleteJson),
    ]);

    if (settled[0].status === "rejected") {
      const reason = settled[0].reason as Error & { status?: number };
      return send(res, 502, {
        error: "places upstream error",
        status: reason.status,
        detail: reason.message?.slice(0, 500) ?? String(reason),
      });
    }

    const general = normalizeAutocompletePredictions(settled[0].value);
    let adminArea: NormalizedSuggestion[] = [];
    if (includeAdminAreas && settled[1].status === "fulfilled") {
      adminArea = normalizeAutocompletePredictions(settled[1].value);
    }

    const suggestions = includeAdminAreas ? mergeByPlaceId(adminArea, general) : general;

    return send(res, 200, { suggestions });
  } catch (err) {
    return send(res, 500, {
      error: "places fetch failed",
      detail: err instanceof Error ? err.message : String(err),
    });
  }
}

async function handleDetails(
  req: IncomingMessage,
  res: ServerResponse,
  apiKey: string | undefined,
) {
  if (!apiKey) {
    return send(res, 503, { error: "places provider not configured" });
  }
  const url = new URL(req.url ?? "/", "http://x");
  const placeId = url.searchParams.get("placeId") ?? "";
  if (!placeId || placeId.length > 256) return send(res, 400, { error: "invalid placeId" });
  const sessionToken = url.searchParams.get("sessionToken") ?? undefined;
  const predictionDescription =
    url.searchParams.get("predictionDescription") ?? undefined;

  const fields = ["addressComponents", "location", "formattedAddress", "types"].join(",");
  const upstream = new URL(
    `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`,
  );
  upstream.searchParams.set("languageCode", "en");
  upstream.searchParams.set("regionCode", "US");
  if (sessionToken) upstream.searchParams.set("sessionToken", sessionToken);

  try {
    const r = await fetch(upstream, {
      method: "GET",
      headers: {
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": fields,
      },
    });
    if (!r.ok) {
      const text = await r.text().catch(() => "");
      return send(res, 502, {
        error: "places upstream error",
        status: r.status,
        detail: text.slice(0, 500),
      });
    }
    const json = (await r.json()) as {
      addressComponents?: Array<{ longText?: string; shortText?: string; types?: string[] }>;
      location?: { latitude: number; longitude: number };
      formattedAddress?: string;
      types?: string[];
    };
    const components = json.addressComponents ?? [];
    const pick = (type: string, variant: "long" | "short" = "long") => {
      const m = components.find((c) => (c.types ?? []).includes(type));
      if (!m) return null;
      return (variant === "short" ? m.shortText : m.longText) ?? m.longText ?? null;
    };
    const streetNumber = pick("street_number");
    const route = pick("route");
    const street = [streetNumber, route].filter(Boolean).join(" ").trim();
    let city =
      pick("locality") ??
      pick("postal_town") ??
      pick("sublocality") ??
      pick("administrative_area_level_2") ??
      "";
    const state = pick("administrative_area_level_1", "short") ?? "";
    const postalCode = pick("postal_code");
    const country = pick("country", "short");
    let formattedAddress: string | null = json.formattedAddress ?? null;

    const hintPatch = applyLocalityHint({
      predictionDescription,
      resolvedState: state,
      resolvedPostalCode: postalCode,
    });
    if (hintPatch) {
      city = hintPatch.city;
      formattedAddress = hintPatch.formattedAddress;
    }

    return send(res, 200, {
      placeId,
      street,
      city,
      state,
      postalCode,
      country,
      latitude: json.location?.latitude ?? null,
      longitude: json.location?.longitude ?? null,
      formattedAddress,
      types: json.types ?? [],
    });
  } catch (err) {
    return send(res, 500, {
      error: "places fetch failed",
      detail: err instanceof Error ? err.message : String(err),
    });
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [react(), tailwindcss(), placesApiPlugin(env.GOOGLE_MAPS_API_KEY)],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "src"),
      },
    },
    server: {
      port: 5173,
    },
  };
});
