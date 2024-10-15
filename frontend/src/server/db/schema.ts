import {
  serial,
  timestamp,
  pgTableCreator,
  varchar,
  integer,
} from 'drizzle-orm/pg-core';

export const createTable = pgTableCreator((name: string) => `qario_${name}`);

export const projects = createTable('projects', {
  id: serial('id').primaryKey(),
  userId: varchar('user_id', { length: 255 }).notNull(),
  title: varchar('title', { length: 255 }).notNull(),
  finalVideoUrl: varchar('final_video_url', { length: 255 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Project Files Table
export const projectFiles = createTable('project_files', {
  id: serial('id').primaryKey(),
  projectId: integer('project_id')
    .notNull()
    .references(() => projects.id),
  userId: varchar('user_id', { length: 255 }).notNull(),
  type: varchar('type', { length: 255 }).notNull(), // 'left_camera', 'main_camera', 'right_camera', 'left_audio', 'right_audio'
  fileKey: varchar('file_key', { length: 255 }).notNull(),
  url: varchar('url', { length: 255 }).notNull(),
  format: varchar('format', { length: 255 }),
  status: varchar('status', { length: 255 }).default('uploading'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
