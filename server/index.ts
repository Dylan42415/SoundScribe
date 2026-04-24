import "dotenv/config";
import express, { type Request, Response, NextFunction } from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import path from "path";
import fs from "fs";

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

declare global {
  namespace Express {
    interface Request {
      isAuthenticated(): boolean;
      user?: any;
    }
  }
}

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

// --- Security Layers ---
/* 
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      "default-src": ["'self'"],
      "script-src": ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://*.supabase.co"],
      "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      "font-src": ["'self'", "https://fonts.gstatic.com"],
      "img-src": ["'self'", "data:", "https://*.supabase.co", "https://images.unsplash.com"],
      "connect-src": ["'self'", "https://*.supabase.co", "https://*.openai.com", "https://*.railway.app"],
      "frame-src": ["'self'"],
      "media-src": ["'self'", "data:", "https://*.supabase.co"],
    },
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: false,
}));
*/

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      log(`${req.method} ${path} ${res.statusCode} in ${duration}ms`);
    }
  });

  next();
});

(async () => {
  await registerRoutes(httpServer, app);

  log(`Running in ${process.env.NODE_ENV || "development"} mode`);

  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
    
    // Robust SPA fallback as middleware to catch anything serveStatic missed
    app.use((req, res, next) => {
      // Never handle API routes or non-GET requests here
      if (req.path.startsWith("/api/") || req.method !== "GET") {
        return next();
      }
      
      // Explicitly block common asset types from falling back to index.html
      // This prevents the "Unexpected token <" error
      const isAsset = req.path.match(/\.(js|css|png|jpg|jpeg|svg|webp|woff2?|ico|json|map)$/i);
      if (isAsset) {
        log(`Asset not found: ${req.path}`, "static");
        return res.status(404).send("Asset not found");
      }
      
      const distPath = path.resolve(process.cwd(), "dist", "public");
      const indexPath = path.join(distPath, "index.html");
      
      if (fs.existsSync(indexPath)) {
        // EXTREME CACHE CONTROL: Force fresh index.html every time
        res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
        res.setHeader("Pragma", "no-cache");
        res.setHeader("Expires", "0");
        res.setHeader("Surrogate-Control", "no-store");
        
        // Ensure correct MIME type
        res.setHeader("Content-Type", "text/html");
        res.sendFile(indexPath);
      } else {
        log(`SPA fallback failed: index.html missing at ${indexPath}`, "static");
        next();
      }
    });
  }

  if (process.env.NODE_ENV !== "production") {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // Final Error Handler (MUST BE LAST)
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    if (res.headersSent) return;
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    res.status(status).json({ message });
  });

  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
    },
    () => {
      log(`serving on port ${port}`);
    },
  );
})();
