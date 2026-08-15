import express, { type NextFunction, type Request, type Response, type Router } from "express";
import multer from "multer";
import { buildPingPayload, buildHealthPayload } from "./health/checks";
import { buildVersionPayload } from "./health/version";
import { incrementMetric, logStructuredEvent, observeLatency } from "./services/observability";

type RouteRegistrar = (router: Router) => void;
const WAVE9_CONTRACT_VERSION = "wave9.hybrid.v1";
let migratedRoutesReady = false;

function contractEnvelope(path: string, status: number, payload: unknown) {
  const ok = status < 400;
  const base = payload && typeof payload === "object" && !Array.isArray(payload)
    ? (payload as Record<string, unknown>)
    : {};
  const message = typeof base.error === "string"
    ? base.error
    : (status >= 500 ? "Internal server error" : (status >= 400 ? "Request failed" : null));

  return {
    ...base,
    ok,
    status,
    data: ok ? (base.data ?? payload) : null,
    error: ok ? null : message,
    errorEnvelope: ok
      ? null
      : {
          code: status >= 500 ? "INTERNAL_ERROR" : "REQUEST_ERROR",
          message,
          details: base.details ?? null,
        },
    contract: {
      version: WAVE9_CONTRACT_VERSION,
      path,
      status,
      ok,
      timestamp: new Date().toISOString(),
    },
    meta: {
      ...(typeof base.meta === "object" && base.meta ? (base.meta as Record<string, unknown>) : {}),
      contractVersion: WAVE9_CONTRACT_VERSION,
    },
  };
}

function sendContractJson(response: Response, request: Request, status: number, payload: unknown): void {
  response.setHeader("x-wave-contract-version", WAVE9_CONTRACT_VERSION);
  response.setHeader("x-wave-contract-stable", "true");
  response.status(status).json(contractEnvelope(request.path, status, payload));
}

function getTenantId(request: Request): string {
  const raw = String(request.header("x-tenant-id") || "").trim();
  if (!raw) return "default-tenant";
  return raw.replace(/[^a-zA-Z0-9-_.]/g, "-");
}

function requestLoggingMiddleware(request: Request, response: Response, next: NextFunction): void {
  const startedAt = Date.now();
  const tenantId = getTenantId(request);

  response.on("finish", () => {
    const durationMs = Date.now() - startedAt;
    incrementMetric("http.requests.total");
    incrementMetric(`http.status.${response.statusCode}`);
    observeLatency("http.request.duration_ms", durationMs);
    logStructuredEvent("info", "http.request", {
      method: request.method,
      path: request.path,
      tenant: tenantId,
      statusCode: response.statusCode,
      durationMs,
    });
  });

  next();
}

function tenantHeaderMiddleware(request: Request, _response: Response, next: NextFunction): void {
  if (!request.header("x-tenant-id")) {
    request.headers["x-tenant-id"] = "default-tenant";
  }
  next();
}

function errorHandlerMiddleware(error: any, request: Request, response: Response, _next: NextFunction): void {
  const status = Number(error?.status || error?.statusCode || 500);
  logStructuredEvent("error", "http.error", {
    method: request.method,
    path: request.path,
    tenant: getTenantId(request),
    statusCode: status,
    message: error?.message || "Unhandled error",
  });

  sendContractJson(response, request, status, {
    error: status >= 500 ? "Internal server error" : error?.message || "Request failed",
  });
}

function registerCoreRoutes(router: Router): void {
  router.get("/ping", (request, response) => {
    sendContractJson(response, request, 200, buildPingPayload());
  });

  const healthHandler = (request: Request, response: Response) => {
    const health = buildHealthPayload(request);
    sendContractJson(response, request, health.status, health.body);
  };

  router.get("/gethealth", healthHandler);
  router.get("/ops/health", (request, response) => {
    if (!migratedRoutesReady) {
      sendContractJson(response, request, 503, { error: "Routes are still initializing" });
      return;
    }
    healthHandler(request, response);
  });
  router.get("/version", (request, response) => {
    sendContractJson(response, request, 200, buildVersionPayload());
  });
}

function loadExistingRouteHandlers(router: Router): void {
  const registrars: RouteRegistrar[] = [registerCoreRoutes];
  for (const register of registrars) {
    register(router);
  }
}

function createServer() {
  const app = express();
  const upload = multer();

  app.use(requestLoggingMiddleware);
  app.use(express.json({ limit: "25mb" }));
  app.use(express.urlencoded({ extended: true }));
  app.use(upload.any());
  app.use("/api", tenantHeaderMiddleware);

  const apiRouter = express.Router();
  loadExistingRouteHandlers(apiRouter);
  app.use("/api", apiRouter);

  app.use((request, response) => {
    sendContractJson(response, request, 404, {
      error: "Not Found",
      path: request.path,
      method: request.method,
    });
  });

  app.use(errorHandlerMiddleware);

  return { app, apiRouter };
}

const port = Number(process.env.PORT || 8080);
const { app, apiRouter } = createServer();

app.listen(port, () => {
  console.log(`[express] backend/api listening on port ${port}`);

  void import("./api/registerRoutes.js")
    .then(({ registerMigratedFunctionRoutes }) => {
      registerMigratedFunctionRoutes(apiRouter);
      migratedRoutesReady = true;
      console.log("[express] migrated routes ready");
    })
    .catch((error) => {
      console.error("[express] migrated route initialization failed", error);
    });
});
