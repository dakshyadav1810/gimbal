import fs from "node:fs";
import path from "node:path";
import fastifyStatic from "@fastify/static";
import fastifyWebsocket from "@fastify/websocket";
import type { GimbalConfig } from "@gimbal/shared";
import Fastify from "fastify";
import {
  type ZodTypeProvider,
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";
import type { Container } from "./container.js";
import { registerRoutes } from "./routes.js";
import { WsHub } from "./ws-hub.js";
import { registerWsRoutes } from "./ws-routes.js";

export async function buildApp(config: GimbalConfig, container: Container) {
  const app = Fastify({ logger: true }).withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(fastifyWebsocket);
  await app.register(fastifyStatic, {
    root: path.join(import.meta.dirname, "..", "static"),
    prefix: "/",
  });
  // Second static root for run screenshots (LLD-010 §2.4) — decorateReply: false, the first
  // registration above already added the `reply.sendFile` decorator.
  fs.mkdirSync(config.screenshotsDir, { recursive: true });
  await app.register(fastifyStatic, {
    root: path.resolve(config.screenshotsDir),
    prefix: "/screenshots/",
    decorateReply: false,
  });

  // Must be set before registerRoutes(): the /api routes are registered inside their own
  // encapsulated child plugin (see routes.ts), and setErrorHandler only applies to contexts
  // created after the call — set after registration, it silently never applied to any /api
  // route, which fell back to Fastify's default handler (a different, undocumented error shape)
  // instead of this one.
  app.setErrorHandler(
    (
      err: Error & { statusCode?: number; validation?: unknown[] },
      _req,
      reply,
    ) => {
      const isValidationError =
        err.name === "ZodError" ||
        (Array.isArray(err.validation) && err.validation.length > 0);
      reply.code(err.statusCode ?? (isValidationError ? 400 : 500)).send({
        error: {
          code: isValidationError ? "validation" : "internal",
          message: err.message,
        },
      });
    },
  );

  const hub = new WsHub();
  await registerRoutes(app, container, hub);
  await registerWsRoutes(app, hub);

  // SPA fallback: deep-linked client routes (/tests/:id, /tests/:id/runs/:runId, /reviews, ... —
  // LLD-010 §3.2) aren't real server routes, so serve index.html and let wouter resolve them.
  // The REST API lives entirely under /api (registered in routes.ts) precisely so it can't collide
  // with the dashboard's own paths — /tests, /reviews etc. are free for the SPA to own. The one
  // other real server path outside /api is /screenshots/*, served by its own static root above
  // (this handler only fires when that root's file lookup already missed).
  app.setNotFoundHandler((req, reply) => {
    const isServerPath =
      req.url.startsWith("/api/") || req.url.startsWith("/screenshots/");
    if (req.method === "GET" && !isServerPath) {
      return reply.sendFile("index.html");
    }
    reply
      .code(404)
      .send({ error: { code: "not_found", message: "not found" } });
  });

  return app;
}
