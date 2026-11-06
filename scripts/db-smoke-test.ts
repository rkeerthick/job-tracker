
import { config } from "dotenv";
config({ path: ".env.local" });

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq } from "drizzle-orm";
import { users } from "../db/schema";

async function main() {
  // 1. Connect to Neon
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is missing");
  }

  const sql = neon(process.env.DATABASE_URL);
  const db = drizzle(sql);

  console.log("Connected to Neon!");

  // 2. Insert a test user
  const email = `test-${crypto.randomUUID()}@example.com`;

  const insertedUsers = await db
    .insert(users)
    .values({
      email,
      passwordHash: "dummy-test-hash",
    })
    .returning();

  console.log("Inserted user:", insertedUsers);

  // 3. Fetch the inserted user
  const selectedUsers = await db
    .select()
    .from(users)
    .where(eq(users.email, email));

  console.log("Fetched user:", selectedUsers);

  // 4. Verify
  if (selectedUsers.length > 0) {
    console.log("SUCCESS: Database connection works!");
  } else {
    throw new Error("User was not found");
  }
}

main().catch((error) => {
  console.error("Database test failed:", error);
  process.exitCode = 1;
});
