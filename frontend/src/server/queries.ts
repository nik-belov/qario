// import 'server-only';
'use server';
import { db } from './db';
import { auth } from '@clerk/nextjs/server';
import { projectFiles, projects } from './db/schema';
import { and, eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createId } from '@paralleldrive/cuid2';

// Function to create a new project
export const createProject = async (title: string) => {
  const user = auth();
  if (!user.userId) throw new Error('Unauthorized');

  const [newProject] = await db
    .insert(projects)
    .values({ userId: user.userId, title })
    .returning();
  return newProject;
};

// Function to add project files
export const addProjectFile = async (
  projectId: string,
  type:
    | 'left_camera'
    | 'main_camera'
    | 'right_camera'
    | 'left_audio'
    | 'right_audio',
  fileKey: string,
  url: string,
  format: string
) => {
  const user = auth();
  if (!user.userId) throw new Error('Unauthorized');

  const project = await db.query.projects.findFirst({
    where: (project, { eq }) =>
      and(eq(project.id, projectId), eq(project.userId, user.userId)),
  });

  if (!project) {
    throw new Error('Project not found');
  }

  const [newFile] = await db
    .insert(projectFiles)
    .values({
      userId: user.userId,
      projectId,
      type,
      fileKey,
      url,
      format,
    })
    .returning();
  return newFile;
};

export async function updateProjectFinalVideo(
  projectId: string,
  finalVideoUrl: string
) {
  return await db
    .update(projects)
    .set({ finalVideoUrl })
    .where(eq(projects.id, projectId))
    .returning();
}

// Function to retrieve files for a project
export const getProjectFiles = async (projectId: string) => {
  const user = auth();
  if (!user.userId) throw new Error('Unauthorized');

  const project = await db.query.projects.findFirst({
    where: (project, { eq }) =>
      and(eq(project.id, projectId), eq(project.userId, user.userId)),
  });

  if (!project) throw new Error('Project not found or unauthorized');

  return db
    .select()
    .from(projectFiles)
    .where(eq(projectFiles.projectId, projectId));
};

export async function getMyProjects() {
  const user = auth();

  if (!user.userId) throw new Error('Unauthorized');

  const projects = await db.query.projects.findMany({
    where: (project, { eq }) => eq(project.userId, user.userId),
    orderBy: (project, { desc }) => desc(project.id),
  });

  return projects;
}

export async function getProjectById(projectId: string) {
  const user = auth();
  if (!user.userId) throw new Error('Unauthorized');

  const project = await db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);

  if (!project[0]) throw new Error('Project not found');

  if (project[0].userId !== user.userId) throw new Error('Unauthorized');

  const files = await db
    .select()
    .from(projectFiles)
    .where(eq(projectFiles.projectId, projectId));

  return {
    ...project[0],
    files, // Include project files (video/audio)
  };
}

export async function deleteProject(projectId: string) {
  const user = auth();
  if (!user.userId) throw new Error('Unauthorized');

  await db
    .delete(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, user.userId)));

  //   analyticsServerClient.capture({
  //     distinctId: user.userId,
  //     event: "delete project",
  //     properties: {
  //       projectId: id,
  //     },
  //   });

  redirect('/dashboard');
}

export async function getFilesByProject(project: typeof projects.$inferSelect) {
  const user = auth();
  if (!user.userId) throw new Error('Unauthorized');

  const files = await db.query.projectFiles.findMany({
    where: (file, { eq }) => eq(file.projectId, project.id),
    orderBy: (file, { desc }) => desc(file.createdAt),
  });

  return files;
}

export async function deleteFile(file: typeof projectFiles.$inferSelect) {
  const user = auth();
  if (!user.userId) throw new Error('Unauthorized');

  if (file.userId !== user.userId) throw new Error('Unauthorized');

  await db.delete(projectFiles).where(eq(projectFiles.id, file.id));

  // TODO: Add logic to delete the file from storage (e.g., S3, local filesystem)
  // This will depend on how you're storing files in your application

  redirect(`/project/${file.projectId}`);
}

export async function updateProjectTitle({
  projectId,
  title,
}: {
  projectId: string;
  title: string;
}) {
  try {
    await db.update(projects).set({ title }).where(eq(projects.id, projectId));

    revalidatePath('/dashboard');
    revalidatePath(`/project/${projectId}`);
  } catch (error) {
    console.error('Failed to update project title:', error);
    throw new Error('Failed to update project title');
  }
}
