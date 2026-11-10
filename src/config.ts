export type SecretRef = { source: "env" | "file" | "exec" | "store"; provider: string; id: string };
export type Settings = { baseUrl: string; apiKey?: string | SecretRef; model?: string; timeoutMs: number };

export const DEFAULT_TIMEOUT_MS = 30_000;
const MIN_TIMEOUT_MS = 1_000;
// OpenClaw caps every decision at 30 s (DecisionProviderHost budget), so a longer timeout can't apply.
const MAX_TIMEOUT_MS = 30_000;
const MAX_BASE_URL_LENGTH = 256;
// One percent-encoded or word-like path segment; keeps the appended /v1/systemone unambiguous.
const PATH_SEGMENT = /^[A-Za-z0-9._~%-]+$/;
const MAX_MODEL_LENGTH = 128;

/**
 * An http(s) origin with an optional path prefix, normalized and without a trailing slash;
 * anything else is undefined.
 *
 * The path prefix exists because some System One servers are mounted below a gateway path
 * instead of the host root. Alibaba Cloud Model Studio's Token Plan, for example, serves
 * `/v1/systemone` under `/compatible-mode`, so the configured value is
 * `https://token-plan.<region>.maas.aliyuncs.com/compatible-mode` and the plugin still
 * appends `/v1/systemone`. A prefix is appended verbatim, never rewritten: dot segments,
 * query strings, fragments, credentials and whitespace are refused so the joined URL can
 * only ever point at the origin the operator configured.
 */
export function parseBaseUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_BASE_URL_LENGTH) return undefined;
  if (value !== value.trim()) return undefined;
  if (!/^https?:\/\/[^/?#@\s]+(\/[^\s]*)?$/i.test(value)) return undefined;
  if (/[\\]|(^|\/)\.{1,2}(\/|$)/.test(value.slice(value.indexOf("://") + 3))) return undefined;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return undefined;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
  if (url.username || url.password || url.search || url.hash || !url.hostname) return undefined;
  const path = url.pathname.replace(/\/+$/, "");
  if (path && !path.slice(1).split("/").every((segment) => PATH_SEGMENT.test(segment))) return undefined;
  return `${url.origin}${path}`;
}

function isSecretRef(value: unknown): value is SecretRef {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  return (
    ["env", "file", "exec", "store"].includes(v.source as string) &&
    typeof v.provider === "string" && v.provider.length > 0 &&
    typeof v.id === "string" && v.id.length > 0
  );
}

export function parseSettings(raw: unknown): Settings | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const r = raw as Record<string, unknown>;
  const baseUrl = parseBaseUrl(r.baseUrl);
  if (!baseUrl) return undefined;
  const settings: Settings = { baseUrl, timeoutMs: DEFAULT_TIMEOUT_MS };
  if (typeof r.apiKey === "string" && r.apiKey.trim()) settings.apiKey = r.apiKey.trim();
  else if (isSecretRef(r.apiKey)) settings.apiKey = r.apiKey;
  if (typeof r.model === "string" && r.model.trim() && r.model.length <= MAX_MODEL_LENGTH) settings.model = r.model.trim();
  if (Number.isInteger(r.timeoutMs) && (r.timeoutMs as number) >= MIN_TIMEOUT_MS && (r.timeoutMs as number) <= MAX_TIMEOUT_MS) {
    settings.timeoutMs = r.timeoutMs as number;
  }
  return settings;
}
