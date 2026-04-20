import { Express, RequestHandler } from "express";
import { supabase } from "../supabase";
import { authStorage } from "./storage";

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  // cookie-parser is applied globally in index.ts

  // Replicate Passport.js behavior: populate req.user and req.isAuthenticated() on every request
  app.use(async (req, _res, next) => {
    try {
      const token = req.cookies?.auth_token;
      if (token) {
        const { data: { user }, error } = await supabase.auth.getUser(token);
        if (!error && user) {
          (req as any).user = { claims: { sub: user.id } };

          // Upsert user into our DB silently
          await authStorage.upsertUser({
            id: user.id,
            email: user.email!,
            firstName: user.user_metadata?.full_name?.split(" ")[0] || "User",
            lastName: user.user_metadata?.full_name?.split(" ")[1] || "",
            profileImageUrl: user.user_metadata?.avatar_url
          }).catch(() => {}); // Don't block requests if upsert fails
        }
      }
    } catch (e) {
      console.warn("Auth middleware error:", e);
    } finally {
      (req as any).isAuthenticated = () => !!(req as any).user;
      next();
    }
  });
}

export const isAuthenticated: RequestHandler = async (req, res, next) => {
  try {
    const token = req.cookies?.auth_token;
    if (!token) return res.status(401).json({ message: "Unauthorized" });

    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) return res.status(401).json({ message: "Unauthorized" });

    // Add the user to our Postgres DB if not exists (for stats/coin tracking)
    await authStorage.upsertUser({
      id: user.id,
      email: user.email!,
      firstName: user.user_metadata?.full_name?.split(" ")[0] || "User",
      lastName: user.user_metadata?.full_name?.split(" ")[1] || "",
      profileImageUrl: user.user_metadata?.avatar_url
    });

    (req as any).user = { claims: { sub: user.id } }; // For routes.ts compatibility
    next();
  } catch (e) {
    console.error("Auth check failed:", e);
    res.status(500).json({ message: "Internal server error during authentication" });
  }
};

export function registerAuthRoutes(app: Express) {
  // Frontend handles login/logout now. No routes needed here.
}
