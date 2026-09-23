import { Agent, fetch, type Dispatcher } from "undici";
import type { Config } from "./config.js";

export type TimeRange =
  | { type: "relative"; range: number }
  | { type: "absolute"; from: string; to: string };

export interface SearchParams {
  query: string;
  timerange: TimeRange;
  streams?: string[];
  limit: number;
  offset: number;
  sort: "asc" | "desc";
}

export interface SearchMessage {
  index: string;
  message: Record<string, unknown>;
}

export interface SearchResult {
  total: number;
  messages: SearchMessage[];
}

export interface Stream {
  id: string;
  title: string;
  description: string | null;
  disabled: boolean;
  index_set_id?: string;
}

export class GraylogError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "GraylogError";
  }
}

const QUERY_ID = "q";
const SEARCH_TYPE_ID = "m";

export class GraylogClient {
  private readonly authHeader: string;
  private readonly dispatcher?: Dispatcher;

  constructor(private readonly config: Config) {
    this.authHeader = "Basic " + Buffer.from(`${config.token}:token`).toString("base64");
    if (!config.verifySsl) {
      this.dispatcher = new Agent({ connect: { rejectUnauthorized: false } });
    }
  }

  private async request<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
    const url = this.config.baseUrl + path;
    let res;
    try {
      res = await fetch(url, {
        method,
        headers: {
          Authorization: this.authHeader,
          Accept: "application/json",
          "X-Requested-By": "mcp-graylog",
          ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(this.config.timeoutMs),
        dispatcher: this.dispatcher,
      });
    } catch (err) {
      const e = err as Error & { cause?: Error };
      const cause = e.cause?.message ? ` (${e.cause.message})` : "";
      throw new GraylogError(`Request to ${url} failed: ${e.message}${cause}`);
    }

    const text = await res.text();
    if (!res.ok) {
      let hint = "";
      if (res.status === 401) hint = " — check GRAYLOG_TOKEN";
      else if (res.status === 403) hint = " — the token's user lacks permission for this resource";
      throw new GraylogError(
        `Graylog ${method} ${path} returned HTTP ${res.status}${hint}: ${extractError(text)}`,
        res.status,
      );
    }
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new GraylogError(`Graylog ${method} ${path} returned non-JSON response: ${truncate(text, 500)}`);
    }
  }

  async searchMessages(p: SearchParams): Promise<SearchResult> {
    const query: Record<string, unknown> = {
      id: QUERY_ID,
      query: { type: "elasticsearch", query_string: p.query },
      timerange: p.timerange,
      search_types: [
        {
          id: SEARCH_TYPE_ID,
          type: "messages",
          limit: p.limit,
          offset: p.offset,
          sort: [{ field: "timestamp", order: p.sort.toUpperCase() }],
        },
      ],
    };
    if (p.streams?.length) {
      query.filter = {
        type: "or",
        filters: p.streams.map((id) => ({ type: "stream", id })),
      };
    }

    const res = await this.request<any>("POST", "/views/search/sync", { queries: [query] });
    const result = res?.results?.[QUERY_ID];
    const errors: any[] = [...(res?.errors ?? []), ...(result?.errors ?? [])];
    if (errors.length) {
      throw new GraylogError(
        "Search failed: " + errors.map((e) => e.description ?? e.message ?? JSON.stringify(e)).join("; "),
      );
    }
    const st = result?.search_types?.[SEARCH_TYPE_ID];
    if (!st) throw new GraylogError("Unexpected search response: no messages result");
    return {
      total: st.total_results ?? 0,
      messages: (st.messages ?? []).map((m: any) => ({ index: m.index, message: m.message ?? {} })),
    };
  }

  async getMessage(index: string, id: string): Promise<Record<string, unknown>> {
    const res = await this.request<any>(
      "GET",
      `/messages/${encodeURIComponent(index)}/${encodeURIComponent(id)}`,
    );
    return res?.message ?? res;
  }

  async listStreams(): Promise<Stream[]> {
    const res = await this.request<any>("GET", "/streams");
    return (res?.streams ?? []).map((s: any) => ({
      id: s.id,
      title: s.title,
      description: s.description ?? null,
      disabled: Boolean(s.disabled),
      index_set_id: s.index_set_id,
    }));
  }
}

function extractError(text: string): string {
  try {
    const j = JSON.parse(text);
    if (typeof j?.message === "string") return j.message;
  } catch {
    // not JSON
  }
  return truncate(text, 1000) || "(empty body)";
}

export function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + "…" : s;
}
