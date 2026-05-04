/**
 * Override Google's `locality` with the city from the user's prediction when
 * state + ZIP match — avoids centroid mismatches (e.g. unincorporated vs USPS city).
 * Pure functions; shared by Vite middleware and tests.
 */

export type LocalityHint = {
  city: string;
  state: string;
  zip: string | null;
};

/** Two-part "City, ST" / "City, ST ZIP" predictions; null for streets or other shapes. */
export function parseUsTwoPartLocalityPrediction(
  description: string,
): LocalityHint | null {
  const trimmed = description.trim().replace(/,?\s*USA\s*$/i, "").trim();
  const parts = trimmed.split(",").map((p) => p.trim());
  if (parts.length !== 2) return null;
  const [left, right] = parts;
  if (!left || !right) return null;
  if (/^\d/.test(left)) return null; // reject street-style first segments

  const m = right.match(/^([A-Za-z]{2})(?:\s+(\d{5}(?:-\d{4})?))?$/);
  if (!m || !m[1]) return null;
  return {
    city: left,
    state: m[1].toUpperCase(),
    zip: m[2] ?? null,
  };
}

export function zip5(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  const digits = value.replace(/\D/g, "");
  return digits.length >= 5 ? digits.slice(0, 5) : null;
}

/** Null if Google resolution should stand; else patched city + formatted line. */
export function applyLocalityHint(opts: {
  predictionDescription: string | null | undefined;
  resolvedState: string;
  resolvedPostalCode: string | null;
}): { city: string; formattedAddress: string } | null {
  if (!opts.predictionDescription) return null;
  const hint = parseUsTwoPartLocalityPrediction(opts.predictionDescription);
  if (!hint) return null;

  const stateOk = opts.resolvedState.toUpperCase() === hint.state;
  const detailsZip5 = zip5(opts.resolvedPostalCode);
  const hintZip5 = zip5(hint.zip);
  const zipOk = !hintZip5 || !detailsZip5 || hintZip5 === detailsZip5;
  if (!stateOk || !zipOk) return null;

  const formattedAddress = opts.predictionDescription
    .trim()
    .replace(/,?\s*USA\s*$/i, "")
    .trim();
  return { city: hint.city, formattedAddress };
}
