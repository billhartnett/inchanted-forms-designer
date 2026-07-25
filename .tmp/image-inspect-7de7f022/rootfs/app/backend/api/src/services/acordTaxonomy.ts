import fs from "node:fs";
import path from "node:path";

const AUGMENTED_JSON_PATH = path.resolve(
  __dirname,
  "../../../data/acord-elabels-with-categories.json",
);

type RawAugmentedEntry = {
  eLabelName?: unknown;
  category?: unknown;
};

let loaded = false;
const codeToCategory = new Map<string, string>();
const categoryToCodes = new Map<string, string[]>();

function loadOnce(): void {
  if (loaded) return;

  if (!fs.existsSync(AUGMENTED_JSON_PATH)) {
    loaded = true;
    return;
  }

  try {
    const raw = fs.readFileSync(AUGMENTED_JSON_PATH, "utf8");
    const payload = JSON.parse(raw);
    if (!Array.isArray(payload)) {
      loaded = true;
      return;
    }

    for (const item of payload as RawAugmentedEntry[]) {
      const code = typeof item?.eLabelName === "string" ? item.eLabelName.trim() : "";
      const category = typeof item?.category === "string" ? item.category.trim() : "";
      if (!code) continue;
      const normalizedCategory = category || "Miscellaneous";
      codeToCategory.set(code, normalizedCategory);
      const current = categoryToCodes.get(normalizedCategory) || [];
      current.push(code);
      categoryToCodes.set(normalizedCategory, current);
    }

    for (const [key, value] of categoryToCodes.entries()) {
      const deduped = Array.from(new Set(value)).sort((a, b) => a.localeCompare(b));
      categoryToCodes.set(key, deduped);
    }
  } catch {
    // Fail-open: taxonomy is optional at runtime.
  }

  loaded = true;
}

export function getCategoryForAcordCode(acordCode: string): string | undefined {
  loadOnce();
  return codeToCategory.get(acordCode);
}

export function getAcordCodesForCategory(category: string): Set<string> {
  loadOnce();
  const codes = categoryToCodes.get(category) || [];
  return new Set(codes);
}

export function isTaxonomyLoaded(): boolean {
  loadOnce();
  return codeToCategory.size > 0;
}
