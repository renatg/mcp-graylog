export interface InstanceConfig {
  name: string;
  baseUrl: string;
  token: string;
  /** Env variable the token came from, used in auth error hints. */
  tokenEnv: string;
  verifySsl: boolean;
  timeoutMs: number;
  maxLimit: number;
}

export interface Config {
  instances: InstanceConfig[];
  defaultInstance: string;
}

const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_MAX_LIMIT = 500;
const INSTANCE_NAME_RE = /^[A-Za-z0-9_-]+$/;

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

// Normalize to ".../api" without trailing slash.
function normalizeBaseUrl(url: string): string {
  let baseUrl = url.replace(/\/+$/, "");
  if (!/\/api$/.test(baseUrl)) baseUrl += "/api";
  return baseUrl;
}

interface Defaults {
  verifySsl: boolean;
  timeoutMs: number;
  maxLimit: number;
}

function loadDefaults(env: NodeJS.ProcessEnv): Defaults {
  return {
    verifySsl: parseBool(env.GRAYLOG_VERIFY_SSL, true),
    timeoutMs: parsePositiveInt("GRAYLOG_TIMEOUT_MS", env.GRAYLOG_TIMEOUT_MS, DEFAULT_TIMEOUT_MS),
    maxLimit: parsePositiveInt("GRAYLOG_MAX_LIMIT", env.GRAYLOG_MAX_LIMIT, DEFAULT_MAX_LIMIT),
  };
}

function loadLegacy(env: NodeJS.ProcessEnv): Config {
  const url = env.GRAYLOG_URL?.trim();
  const token = env.GRAYLOG_TOKEN?.trim();
  if (!url) {
    throw new Error(
      "GRAYLOG_URL is not set (e.g. https://graylog.local:9000); " +
        "for several instances set GRAYLOG_INSTANCES instead",
    );
  }
  if (!token) throw new Error("GRAYLOG_TOKEN is not set (Graylog API access token)");

  const instance: InstanceConfig = {
    name: "default",
    baseUrl: normalizeBaseUrl(url),
    token,
    tokenEnv: "GRAYLOG_TOKEN",
    ...loadDefaults(env),
  };
  return { instances: [instance], defaultInstance: instance.name };
}

function loadInstance(env: NodeJS.ProcessEnv, name: string, defaults: Defaults): InstanceConfig {
  const prefix = `GRAYLOG_${name.toUpperCase().replace(/-/g, "_")}_`;
  const url = env[prefix + "URL"]?.trim();
  const token = env[prefix + "TOKEN"]?.trim();
  if (!url) throw new Error(`${prefix}URL is not set for instance "${name}"`);
  if (!token) throw new Error(`${prefix}TOKEN is not set for instance "${name}"`);

  return {
    name,
    baseUrl: normalizeBaseUrl(url),
    token,
    tokenEnv: prefix + "TOKEN",
    verifySsl: parseBool(env[prefix + "VERIFY_SSL"], defaults.verifySsl),
    timeoutMs: parsePositiveInt(prefix + "TIMEOUT_MS", env[prefix + "TIMEOUT_MS"], defaults.timeoutMs),
    maxLimit: parsePositiveInt(prefix + "MAX_LIMIT", env[prefix + "MAX_LIMIT"], defaults.maxLimit),
  };
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const list = env.GRAYLOG_INSTANCES?.trim();
  if (!list) return loadLegacy(env);

  const names = list.split(",").map((s) => s.trim());
  const seen = new Set<string>();
  for (const name of names) {
    if (!name) throw new Error(`GRAYLOG_INSTANCES contains an empty name: "${list}"`);
    if (!INSTANCE_NAME_RE.test(name)) {
      throw new Error(`Invalid instance name "${name}" in GRAYLOG_INSTANCES (allowed: letters, digits, _ and -)`);
    }
    // Names map to env prefixes case-insensitively, and "-" and "_" map to the same prefix.
    const key = name.toUpperCase().replace(/-/g, "_");
    if (seen.has(key)) throw new Error(`Duplicate instance name "${name}" in GRAYLOG_INSTANCES`);
    seen.add(key);
  }

  const defaults = loadDefaults(env);
  const instances = names.map((name) => loadInstance(env, name, defaults));
  return { instances, defaultInstance: instances[0].name };
}
