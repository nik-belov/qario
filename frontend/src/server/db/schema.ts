import { timestamp, pgTableCreator, varchar } from 'drizzle-orm/pg-core';
import { createId } from '@paralleldrive/cuid2';

export const createTable = pgTableCreator((name: string) => `qario_${name}`);

export const projects = createTable('projects', {
  id: varchar('id', { length: 128 })
    .primaryKey()
    .$defaultFn(() => createId()),
  userId: varchar('user_id', { length: 255 }).notNull(),
  title: varchar('title', { length: 255 }).notNull(),
  finalVideoUrl: varchar('final_video_url', { length: 255 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Project Files Table
export const projectFiles = createTable('project_files', {
  id: varchar('id', { length: 128 })
    .primaryKey()
    .$defaultFn(() => createId()),
  projectId: varchar('project_id', { length: 128 })
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
