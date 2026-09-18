import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { globalUsageAnalytics } from "../../telemetry/usage-analytics.js";

interface TimeRangeQuery {
  range?: string;
  startDate?: string;
  endDate?: string;
}

function resolveTimeBounds(query: TimeRangeQuery): { start: number; end: number } {
  const now = Math.floor(Date.now() / 1000);

  // If explicit timestamps provided
  if (query.startDate && query.endDate) {
    const s = Number(query.startDate) || Math.floor(new Date(query.startDate).getTime() / 1000);
    const e = Number(query.endDate) || Math.floor(new Date(query.endDate).getTime() / 1000);
    if (Number.isFinite(s) && Number.isFinite(e) && s <= e) {
      return { start: s, end: e };
    }
  }

  const range = (query.range || "7d").toLowerCase();
  switch (range) {
    case "today":
    case "24h":
      return { start: now - 86400, end: now };
    case "yesterday":
      return { start: now - 172800, end: now - 86400 };
    case "7d":
      return { start: now - 7 * 86400, end: now };
    case "14d":
      return { start: now - 14 * 86400, end: now };
    case "30d":
      return { start: now - 30 * 86400, end: now };
    case "month":
    case "mtd": {
      const d = new Date();
      const startOfMonth = new Date(d.getFullYear(), d.getMonth(), 1).getTime() / 1000;
      return { start: Math.floor(startOfMonth), end: now };
    }
    case "all":
      return { start: 0, end: now };
    default:
      return { start: now - 7 * 86400, end: now };
  }
}

export function registerAdminUsageRoutes(fastify: FastifyInstance): void {
  // 1. GET /api/admin/usage/summary
  fastify.get(
    "/api/admin/usage/summary",
    async (
      req: FastifyRequest<{
        Querystring: TimeRangeQuery & { compare?: string };
      }>
    ) => {
      const bounds = resolveTimeBounds(req.query);
      const compare = req.query.compare !== "false";
      return globalUsageAnalytics.getComparativeSummary(bounds.start, bounds.end, compare);
    }
  );

  // 2. GET /api/admin/usage/timeseries
  fastify.get(
    "/api/admin/usage/timeseries",
    async (
      req: FastifyRequest<{
        Querystring: TimeRangeQuery & { granularity?: "hour" | "day" };
      }>
    ) => {
      const bounds = resolveTimeBounds(req.query);
      const spanSeconds = bounds.end - bounds.start;
      const defaultGranularity = spanSeconds <= 86400 * 2 ? "hour" : "day";
      const granularity = req.query.granularity || defaultGranularity;

      const items = globalUsageAnalytics.getTimeSeries(bounds.start, bounds.end, granularity);
      return {
        items,
        count: items.length,
        granularity,
        start: bounds.start,
        end: bounds.end,
      };
    }
  );

  // 3. GET /api/admin/usage/pivot
  fastify.get(
    "/api/admin/usage/pivot",
    async (
      req: FastifyRequest<{
        Querystring: TimeRangeQuery & {
          dimA?: string;
          dimB?: string;
          search?: string;
        };
      }>
    ) => {
      const bounds = resolveTimeBounds(req.query);
      const dimA = req.query.dimA || "model";
      const dimB = req.query.dimB || "adapter";

      const rows = globalUsageAnalytics.getPivotMatrix(
        dimA,
        dimB,
        bounds.start,
        bounds.end,
        req.query.search
      );

      return {
        rows,
        totalRows: rows.length,
        dimA,
        dimB,
        start: bounds.start,
        end: bounds.end,
      };
    }
  );

  // 4. GET /api/admin/usage/records
  fastify.get(
    "/api/admin/usage/records",
    async (
      req: FastifyRequest<{
        Querystring: TimeRangeQuery & {
          dimA?: string;
          valA?: string;
          dimB?: string;
          valB?: string;
          limit?: string;
          offset?: string;
        };
      }>
    ) => {
      const bounds = resolveTimeBounds(req.query);
      return globalUsageAnalytics.getDrillDownRecords({
        dimA: req.query.dimA,
        valA: req.query.valA,
        dimB: req.query.dimB,
        valB: req.query.valB,
        start: bounds.start,
        end: bounds.end,
        limit: req.query.limit ? parseInt(req.query.limit, 10) : 25,
        offset: req.query.offset ? parseInt(req.query.offset, 10) : 0,
      });
    }
  );

  // 5. GET /api/admin/usage/filters
  fastify.get("/api/admin/usage/filters", async () => {
    return globalUsageAnalytics.getFilterOptions();
  });

  // 6. GET /api/admin/usage/export
  fastify.get(
    "/api/admin/usage/export",
    async (
      req: FastifyRequest<{
        Querystring: TimeRangeQuery & {
          format?: string;
          adapterId?: string;
          model?: string;
          status?: string;
        };
      }>,
      reply: FastifyReply
    ) => {
      const bounds = resolveTimeBounds(req.query);
      const format = (req.query.format || "csv").toLowerCase();

      if (format === "csv") {
        const stream = globalUsageAnalytics.createCsvExportStream(bounds.start, bounds.end, {
          adapterId: req.query.adapterId,
          model: req.query.model,
          status: req.query.status,
        });

        // Ensure socket abort clean-up
        req.raw.on("close", () => {
          stream.destroy();
        });

        const filename = `usage-export-${bounds.start}-${bounds.end}.csv`;
        reply.header("Content-Type", "text/csv; charset=utf-8");
        reply.header("Content-Disposition", `attachment; filename="${filename}"`);
        return reply.send(stream);
      }

      // Default JSON export
      const records = globalUsageAnalytics.getDrillDownRecords({
        start: bounds.start,
        end: bounds.end,
        limit: 1000,
        offset: 0,
      });

      const filename = `usage-export-${bounds.start}-${bounds.end}.json`;
      reply.header("Content-Type", "application/json; charset=utf-8");
      reply.header("Content-Disposition", `attachment; filename="${filename}"`);
      return reply.send(records);
    }
  );
}
