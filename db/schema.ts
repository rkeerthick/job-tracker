
import {
  pgTable,
  serial,
  varchar,
  text,
  timestamp,
  integer,
  pgEnum,
} from "drizzle-orm/pg-core";

export const applicationStatus = pgEnum("application_status", [
  "saved",
  "applied",
  "interview",
  "offer",
  "rejected",
]);

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

  appliedAt: timestamp("applied_at", { withTimezone: true }),
  status: applicationStatus("status").default("applied").notNull(),

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// Notes table
export const notes = pgTable("notes", {
  id: serial("id").primaryKey(),

  applicationId: integer("application_id")
    .notNull()
    .references(() => applications.id, { onDelete: "cascade" }),

  body: text("body").notNull(),

  createdAt: timestamp("created_at").defaultNow().notNull(),
});
