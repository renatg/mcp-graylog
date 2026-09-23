import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import type { Config, InstanceConfig } from "./config.js";
import { GraylogClient, type TimeRange } from "./graylog.js";

const MESSAGE_MAX_CHARS = 2000;
const BASE_FIELDS = ["_id", "timestamp", "source", "message"];

function ok(data: unknown): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

function fail(err: unknown): CallToolResult {
  const text = err instanceof Error ? err.message : String(err);
  return { isError: true, content: [{ type: "text", text }] };
}

function shapeMessage(
  index: string,
  msg: Record<string, unknown>,
  fields?: string[],
): Record<string, unknown> {
  const keep = fields?.length ? new Set([...BASE_FIELDS, ...fields]) : undefined;
  const out: Record<string, unknown> = { index, id: msg._id };
  for (const [k, v] of Object.entries(msg)) {
    if (k === "_id") continue;
    if (keep && !keep.has(k)) continue;
    out[k] = v;
  }
  if (typeof out.message === "string" && out.message.length > MESSAGE_MAX_CHARS) {
    out.message = out.message.slice(0, MESSAGE_MAX_CHARS) + "…";
    out.message_truncated = true;
  }
  return out;
}

export function registerTools(server: McpServer, config: Config): void {
  const clients = new Map<string, { instance: InstanceConfig; client: GraylogClient }>();
  for (const instance of config.instances) {
    clients.set(instance.name.toLowerCase(), { instance, client: new GraylogClient(instance) });
  }
  const available = config.instances.map((i) => i.name).join(", ");

  function resolve(name?: string): { instance: InstanceConfig; client: GraylogClient } {
    const key = (name?.trim() || config.defaultInstance).toLowerCase();
    const entry = clients.get(key);
    if (!entry) throw new Error(`Unknown instance "${name}". Available: ${available}`);
    return entry;
  }

  const instanceParam = z
    .string()
    .optional()
    .describe(
      "Graylog instance: " +
        config.instances
          .map((i) => (i.name === config.defaultInstance ? `${i.name} (default)` : i.name))
          .join(", "),
    );

  server.registerTool(
    "list_instances",
    {
      title: "List Graylog instances",
      description: "List configured Graylog instances. Pass `instance` to other tools to choose one.",
      inputSchema: {},
    },
    async () =>
      ok(
        config.instances.map((i) => ({
          name: i.name,
          url: i.baseUrl,
          default: i.name === config.defaultInstance,
          verifySsl: i.verifySsl,
        })),
      ),
  );

  server.registerTool(
    "search_messages",
    {
      title: "Search Graylog messages",
      description:
        "Search log messages in Graylog using Graylog/Lucene query syntax " +
        '(e.g. `level:3 AND source:web01`, `"connection refused"`, `http_status:>=500`). ' +
        "Use either range_seconds (relative, default last 15 minutes) or from/to (absolute ISO 8601). " +
        "Returns total hit count and the matching messages (long `message` fields are truncated; " +
        "use get_message for the full content).",
      inputSchema: {
        instance: instanceParam,
        query: z.string().default("*").describe("Graylog search query; `*` matches everything"),
        range_seconds: z
          .number()
          .int()
          .nonnegative()
          .optional()
          .describe("Relative time range in seconds back from now (default 900). 0 = all time"),
        from: z.string().optional().describe("Absolute range start, ISO 8601 (e.g. 2025-01-31T10:00:00Z)"),
        to: z.string().optional().describe("Absolute range end, ISO 8601; defaults to now if only `from` is set"),
        streams: z.array(z.string()).optional().describe("Restrict to these stream IDs (see list_streams)"),
        fields: z
          .array(z.string())
          .optional()
          .describe("Return only these fields (plus timestamp, source, message). Omit to return all fields"),
        limit: z
          .number()
          .int()
          .positive()
          .default(50)
          .describe("Max messages to return (capped by the instance's max limit)"),
        offset: z.number().int().nonnegative().default(0).describe("Offset for paging"),
        sort: z.enum(["asc", "desc"]).default("desc").describe("Sort by timestamp"),
      },
    },
    async ({ instance: instanceName, query, range_seconds, from, to, streams, fields, limit, offset, sort }) => {
      try {
        const { instance, client } = resolve(instanceName);
        let timerange: TimeRange;
        if (from || to) {
          if (!from) return fail("`from` is required when `to` is set");
          if (range_seconds !== undefined) return fail("Use either range_seconds or from/to, not both");
          const fromDate = new Date(from);
          const toDate = to ? new Date(to) : new Date();
          if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
            return fail("`from`/`to` must be valid ISO 8601 timestamps");
          }
          timerange = { type: "absolute", from: fromDate.toISOString(), to: toDate.toISOString() };
        } else {
          timerange = { type: "relative", range: range_seconds ?? 900 };
        }

        const effectiveLimit = Math.min(limit, instance.maxLimit);
        const result = await client.searchMessages({
          query: query.trim() || "*",
          timerange,
          streams,
          limit: effectiveLimit,
          offset,
          sort,
        });
        return ok({
          instance: instance.name,
          total: result.total,
          returned: result.messages.length,
          offset,
          ...(effectiveLimit < limit ? { limit_capped_to: effectiveLimit } : {}),
          messages: result.messages.map((m) => shapeMessage(m.index, m.message, fields)),
        });
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    "list_streams",
    {
      title: "List Graylog streams",
      description: "List Graylog streams (id, title, description, disabled). Use stream IDs to filter search_messages.",
      inputSchema: { instance: instanceParam },
    },
    async ({ instance }) => {
      try {
        return ok(await resolve(instance).client.listStreams());
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    "get_message",
    {
      title: "Get Graylog message",
      description:
        "Fetch a single message with all its fields by index name and message ID (both returned by search_messages). " +
        "Use the same `instance` as in the search.",
      inputSchema: {
        instance: instanceParam,
        index: z.string().min(1).describe("Index name, e.g. graylog_42"),
        id: z.string().min(1).describe("Message ID (`id` from search results)"),
      },
    },
    async ({ instance, index, id }) => {
      try {
        return ok(await resolve(instance).client.getMessage(index, id));
      } catch (err) {
        return fail(err);
      }
    },
  );
}
