/**
 * Environment configuration loader.
 * Validates all required env vars at startup and fails fast with a clear error.
 * Never logs or exposes secret values.
 */

interface EnvConfig {
  neo4j: {
    uri: string;
    username: string;
    database: string;
  };
  groq: {
    apiKey: boolean; // only flag existence, never expose value
  };
}

const REQUIRED_SECRETS: Record<string, string> = {
  NEO4J_URI: "Neo4j connection URI (e.g. neo4j+s://xxxx.databases.neo4j.io)",
  NEO4J_USERNAME: "Neo4j username",
  NEO4J_PASSWORD: "Neo4j password",
  GROQ_API_KEY: "Groq API key for AI inference",
};

export function validateEnv(): EnvConfig {
  const missing: string[] = [];

  for (const [key, description] of Object.entries(REQUIRED_SECRETS)) {
    if (!process.env[key]) {
      missing.push(`  ${key} — ${description}`);
    }
  }

  if (missing.length > 0) {
    console.error("\n❌ Missing required environment variables:\n");
    missing.forEach((m) => console.error(m));
    console.error("\nPlease set these in Replit Secrets and restart.\n");
    // Do not throw in dev — allow partial functionality
    if (process.env.NODE_ENV === "production") {
      throw new Error("Missing required environment variables. Cannot start in production.");
    }
  }

  return {
    neo4j: {
      uri: process.env.NEO4J_URI ?? "",
      username: process.env.NEO4J_USERNAME ?? "",
      database: process.env.NEO4J_DATABASE ?? "neo4j",
    },
    groq: {
      apiKey: !!process.env.GROQ_API_KEY,
    },
  };
}

/**
 * Safe logger: strips any known secret patterns before logging.
 * Use this instead of console.log for any query/param logging.
 */
export function safeLog(label: string, data: unknown): void {
  if (process.env.NODE_ENV === "production") return; // no query logging in prod
  const str = JSON.stringify(data, null, 2) ?? String(data);
  // Redact anything that looks like a password or token (32+ char alphanumeric)
  const redacted = str.replace(/([A-Za-z0-9_\-]{32,})/g, "[REDACTED]");
  console.log(`[graph] ${label}:`, redacted);
}
