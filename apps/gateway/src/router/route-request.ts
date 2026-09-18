import type { ChatRequest, CliEvent } from "../core/types.js";
import { RouteError } from "../protocol/errors.js";

export interface RouteMeta {
  groupId?: string;
  adapterId: string;
  accountId: string;
  modelExecuted: string;
  sessionReused: boolean;
  cacheHit: boolean;
  failoverCount: number;
}

export async function routeRequest(_req: ChatRequest): Promise<{
  events: AsyncIterable<CliEvent>;
  meta: RouteMeta;
}> {
  throw new RouteError("not_implemented", "Routing is not implemented yet");
}
