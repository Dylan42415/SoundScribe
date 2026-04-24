import "dotenv/config";
import pg from "pg";

const { Client } = pg;

async function main() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  console.log("Connected to database.");

  // Add translations column if it doesn't exist
  await client.query(`
    ALTER TABLE recordings
    ADD COLUMN IF NOT EXISTS translations jsonb DEFAULT '{}'::jsonb;
  `);
  console.log("✅ translations column added (or already exists).");

  await client.end();
  console.log("Done.");
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
