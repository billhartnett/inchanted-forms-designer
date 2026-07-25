import express, { type NextFunction, type Request, type Response, type Router } from "express";
import multer from "multer";
import { registerMigratedFunctionRoutes } from "./api/registerRoutes";
import { buildPingPayload, buildHealthPayload } from "./health/checks";
import { buildVersionPayload } from "./health/version";
import { incrementMetric, logStructuredEvent, observeLatency } from "./services/observability";

type RouteRegistrar = (router: Router) => void;

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

  response.status(status).json({
    error: status >= 500 ? "Internal server error" : error?.message || "Request failed",
  });
}

function registerCoreRoutes(router: Router): void {
  router.get("/ping", (_request, response) => {
    response.status(200).json(buildPingPayload());
  });

  const healthHandler = (request: Request, response: Response) => {
    const health = buildHealthPayload(request);
    response.status(health.status).json(health.body);
  };

  router.get("/gethealth", healthHandler);
  router.get("/ops/health", healthHandler);
  router.get("/version", (_request, response) => {
    response.status(200).json(buildVersionPayload());
  });
}

function registerWave9Routes(_router: Router): void {
  registerMigratedFunctionRoutes(_router);
}

function loadExistingRouteHandlers(router: Router): void {
  const registrars: RouteRegistrar[] = [registerCoreRoutes, registerWave9Routes];
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
    response.status(404).json({
      error: "Not Found",
      path: request.path,
      method: request.method,
    });
  });

  app.use(errorHandlerMiddleware);

  return app;
}

const port = Number(process.env.PORT || 8080);
const server = createServer();

server.listen(port, () => {
  console.log(`[express] backend/api listening on port ${port}`);
});
