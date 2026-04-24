import { Express, RequestHandler } from "express";
import { supabase } from "../supabase";
import { authStorage } from "./storage";

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  // cookie-parser is applied globally in index.ts

  // Replicate Passport.js behavior: populate req.user and req.isAuthenticated() on every request
  // Populate req.user and req.isAuthenticated() on every request with caching
  app.use(async (req, _res, next) => {
    (req as any).isAuthenticated = () => !!(req as any).user;
    
    try {
      // If already populated by a previous middleware
      if ((req as any).user) return next();

      const token = req.cookies?.auth_token;
      if (!token) return next();

      const { data: { user }, error } = await supabase.auth.getUser(token);
      if (!error && user) {
        (req as any).user = { claims: { sub: user.id, email: user.email } };

        // Background upsert (don't await to keep request fast)
        authStorage.upsertUser({
          id: user.id,
          email: user.email!,
          firstName: user.user_metadata?.full_name?.split(" ")[0] || "User",
          lastName: user.user_metadata?.full_name?.split(" ")[1] || "",
          profileImageUrl: user.user_metadata?.avatar_url
        }).catch(() => {}); 
      }
    } catch (e) {
      console.warn("Auth middleware error:", e);
    } finally {
      next();
    }
  });
}

export const isAuthenticated: RequestHandler = async (req, res, next) => {
  // Use cached user if available from the global middleware
  if ((req as any).user) return next();

  try {
    const token = req.cookies?.auth_token;
    if (!token) return res.status(401).json({ message: "Unauthorized" });

    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) return res.status(401).json({ message: "Unauthorized" });

    (req as any).user = { claims: { sub: user.id, email: user.email } };
    next();
  } catch (e) {
    console.error("Auth check failed:", e);
    res.status(500).json({ message: "Internal server error during authentication" });
  }
};

export const isAdmin: RequestHandler = async (req, res, next) => {
  try {
    const token = req.cookies?.auth_token;
    if (!token) return res.status(401).json({ message: "Unauthorized" });

    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) return res.status(401).json({ message: "Unauthorized" });

    // Fetch user from DB to check role
    const dbUser = await authStorage.getUser(user.id);
    if (!dbUser || dbUser.role !== "admin") {
      return res.status(403).json({ message: "Forbidden: Admin access required" });
    }

    (req as any).user = { claims: { sub: user.id } };
    next();
  } catch (e) {
    console.error("Admin check failed:", e);
    res.status(500).json({ message: "Internal server error during admin check" });
  }
};

export function registerAuthRoutes(app: Express) {
  // Frontend handles login/logout now. No routes needed here.
}
