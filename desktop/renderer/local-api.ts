import * as catalogRoute from "../../app/api/catalog/route";
import * as consultationDraftRoute from "../../app/api/consultation-drafts/[id]/route";
import * as completeConsultationDraftRoute from "../../app/api/consultation-drafts/[id]/complete/route";
import * as importPatientsRoute from "../../app/api/patients/import/route";
import * as patientsRoute from "../../app/api/patients/route";
import * as priorVisitsRoute from "../../app/api/prior-visits/route";

// Each route declares its own params shape, so handlers are called with
// params matched from the path below.
type RouteHandler = (
  request: Request,
  context: { params: Promise<never> },
) => Response | Promise<Response>;

type RouteModule = Partial<Record<string, RouteHandler>>;

// The same route modules the Cloudflare Worker serves, matched in the same
// way, so the desktop app answers `/api/*` without a server or a network.
const localRoutes: {
  pattern: RegExp;
  params?: string[];
  module: RouteModule;
}[] = [
  { pattern: /^\/api\/catalog$/, module: catalogRoute },
  {
    pattern: /^\/api\/consultation-drafts\/([^/]+)\/complete$/,
    params: ["id"],
    module: completeConsultationDraftRoute,
  },
  {
    pattern: /^\/api\/consultation-drafts\/([^/]+)$/,
    params: ["id"],
    module: consultationDraftRoute,
  },
  { pattern: /^\/api\/patients\/import$/, module: importPatientsRoute },
  { pattern: /^\/api\/patients$/, module: patientsRoute },
  { pattern: /^\/api\/prior-visits$/, module: priorVisitsRoute },
];

function jsonError(error: string, status: number) {
  return Response.json({ error }, { status });
}

async function handleLocally(request: Request) {
  const { pathname } = new URL(request.url);
  for (const { pattern, params: paramNames = [], module } of localRoutes) {
    const match = pattern.exec(pathname);
    if (!match) continue;
    const handler = module[request.method];
    if (!handler) return jsonError("Method not allowed", 405);
    const params = Object.fromEntries(
      paramNames.map((name, index) => [
        name,
        decodeURIComponent(match[index + 1]),
      ]),
    );
    try {
      return await handler(request, {
        params: Promise.resolve(params) as Promise<never>,
      });
    } catch (error) {
      console.error(`Local API ${request.method} ${pathname} failed`, error);
      return jsonError("The Clinic PC could not complete this request.", 500);
    }
  }
  return jsonError("Not found", 404);
}

export function serveApiLocally() {
  const networkFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    if (url.origin === window.location.origin && url.pathname.startsWith("/api/")) {
      return handleLocally(request);
    }
    return networkFetch(request);
  };
}
