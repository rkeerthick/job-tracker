
import {
  pgTable,
  serial,
  varchar,
  text,
  timestamp,
  integer,
  pgEnum,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { STATUSES } from "../lib/statuses";

export const applicationStatus = pgEnum("application_status", STATUSES);

// Users table
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Applications table
export const applications = pgTable("applications", {
  id: serial("id").primaryKey(),

  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),

  company: varchar("company", { length: 255 }).notNull(),
  role: varchar("role", { length: 255 }).notNull(),
  link: text("link"),

  // Filled later by posting extraction / chat features. All nullable: existing rows stay valid.
  location: varchar("location", { length: 255 }),
  salaryText: varchar("salary_text", { length: 255 }), // free text: "₹12–18 LPA", "$120k–150k", ...
  skills: text("skills").array(),
  interviewAt: timestamp("interview_at", { withTimezone: true }),

  appliedAt: timestamp("applied_at", { withTimezone: true }),
  status: applicationStatus("status").default("saved").notNull(),

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
},
  (table) => [
    // WHERE user_id = ? ORDER BY created_at DESC LIMIT n: filter + order from one index
    index("applications_user_created_idx").on(table.userId, table.createdAt),
  ]
);

// Notes table
export const notes = pgTable("notes", {
  id: serial("id").primaryKey(),

  applicationId: integer("application_id")
    .notNull()
    .references(() => applications.id, { onDelete: "cascade" }),

  body: text("body").notNull(),

  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const sessions = pgTable(
  "sessions",
  {
    id: serial("id").primaryKey(),

    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    tokenHash: text("token_hash").notNull(),

    expiresAt: timestamp("expires_at", {
      withTimezone: true,
    }).notNull(),

    createdAt: timestamp("created_at", {
      withTimezone: true,
    }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("sessions_token_hash_idx").on(table.tokenHash),
  ]
);
