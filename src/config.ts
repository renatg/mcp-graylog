export interface Config {
  baseUrl: string;
  token: string;
  verifySsl: boolean;
  timeoutMs: number;
  maxLimit: number;
}

function parseBool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value.trim() === "") return fallback;
  return !["false", "0", "no", "off"].includes(value.trim().toLowerCase());
}

function parsePositiveInt(name: string, value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === "") return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`${name} must be a positive integer, got "${value}"`);
  }
  return n;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const url = env.GRAYLOG_URL?.trim();
  const token = env.GRAYLOG_TOKEN?.trim();
  if (!url) throw new Error("GRAYLOG_URL is not set (e.g. https://graylog.local:9000)");
  if (!token) throw new Error("GRAYLOG_TOKEN is not set (Graylog API access token)");

  // Normalize to ".../api" without trailing slash.
  let baseUrl = url.replace(/\/+$/, "");
  if (!/\/api$/.test(baseUrl)) baseUrl += "/api";

  return {
    baseUrl,
    token,
    verifySsl: parseBool(env.GRAYLOG_VERIFY_SSL, true),
    timeoutMs: parsePositiveInt("GRAYLOG_TIMEOUT_MS", env.GRAYLOG_TIMEOUT_MS, 30000),
    maxLimit: parsePositiveInt("GRAYLOG_MAX_LIMIT", env.GRAYLOG_MAX_LIMIT, 500),
  };
}
