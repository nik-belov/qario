// import 'server-only';
'use server';
import { db } from './db';
import { auth } from '@clerk/nextjs/server';
import { projectFiles, projects } from './db/schema';
import { and, eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';

// Function to create a new project
export const createProject = async (title: string) => {
  const { userId } = await auth();
  if (!userId) throw new Error('Unauthorized');

  const [newProject] = await db
    .insert(projects)
    .values({ userId, title })
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
    | 'right_audio'
    | 'zoom_video',
  fileKey: string,
  url: string,
  format: string
) => {
  const { userId } = await auth();
  if (!userId) throw new Error('Unauthorized');

  const project = await db.query.projects.findFirst({
    where: (project, { eq }) =>
      and(eq(project.id, projectId), eq(project.userId, userId)),
  });

  if (!project) {
    throw new Error('Project not found');
  }

  const [newFile] = await db
    .insert(projectFiles)
    .values({
      userId,
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
  processedVideoUrl: string
) {
  return await db
    .update(projects)
    .set({ finalVideoUrl: processedVideoUrl })
    .where(eq(projects.id, projectId))
    .returning();
}

// Function to retrieve files for a project
export const getProjectFiles = async (projectId: string) => {
  const { userId } = await auth();
  if (!userId) throw new Error('Unauthorized');

  const project = await db.query.projects.findFirst({
    where: (project, { eq }) =>
      and(eq(project.id, projectId), eq(project.userId, userId)),
  });

  if (!project) throw new Error('Project not found or unauthorized');

  return db
    .select()
    .from(projectFiles)
    .where(eq(projectFiles.projectId, projectId));
};

export async function getMyProjects() {
  const { userId } = await auth();
  if (!userId) throw new Error('Unauthorized');

  const projects = await db.query.projects.findMany({
    where: (project, { eq }) => eq(project.userId, userId),
    orderBy: (project, { desc }) => desc(project.id),
  });

  return projects;
}

export async function getProjectById(projectId: string) {
  const { userId } = await auth();
  if (!userId) throw new Error('Unauthorized');

  const project = await db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);

  if (!project[0]) throw new Error('Project not found');

  if (project[0].userId !== userId) throw new Error('Unauthorized');

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
  const { userId } = await auth();
  if (!userId) throw new Error('Unauthorized');

  await db
    .delete(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)));

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
  const { userId } = await auth();
  if (!userId) throw new Error('Unauthorized');

  const files = await db.query.projectFiles.findMany({
    where: (file, { eq }) => eq(file.projectId, project.id),
    orderBy: (file, { desc }) => desc(file.createdAt),
  });

  return files;
}

export async function deleteFile(file: typeof projectFiles.$inferSelect) {
  const { userId } = await auth();
  if (!userId) throw new Error('Unauthorized');

  if (file.userId !== userId) throw new Error('Unauthorized');

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
  const { userId } = await auth();
  if (!userId) throw new Error('Unauthorized');

  try {
    await db.update(projects).set({ title }).where(eq(projects.id, projectId));

    revalidatePath('/dashboard');
    revalidatePath(`/project/${projectId}`);
  } catch (error) {
    console.error('Failed to update project title:', error);
    throw new Error('Failed to update project title');
  }
}

interface ExportSettings {
  format: string;
  frameRate: string;
  resolution: string;
  quality: string;
}

export async function exportProject(formData: FormData) {
  //   const projectId = formData.get('projectId');
  //   const settings = JSON.parse(formData.get('settings') as string) as ExportSettings;
  //   if (!projectId) throw new Error('Project ID is required');
  //   try {
  //     // 1. Get project data
  //     const project = await getProjectById(projectId);
  //     // 2. Initialize FFmpeg
  //     const ffmpeg = createFFmpeg({ log: true });
  //     await ffmpeg.load();
  //     // 3. Prepare video settings
  //     const outputOptions = [
  //       '-c:v libx264',                    // Video codec
  //       `-r ${settings.frameRate}`,        // Frame rate
  //       `-s ${settings.resolution}`,       // Resolution
  //       settings.quality === 'High'
  //         ? '-crf 18'                      // High quality
  //         : settings.quality === 'Medium'
  //           ? '-crf 23'                    // Medium quality
  //           : '-crf 28',                   // Low quality
  //       '-preset fast',                    // Encoding speed preset
  //       '-movflags +faststart'             // Enable fast start for web playback
  //     ];
  //     // 4. Process the video
  //     // Note: This is a simplified example. You'll need to implement
  //     // the actual video processing logic based on your project structure
  //     await ffmpeg.run(
  //       '-i', 'input.mp4',
  //       ...outputOptions,
  //       `output.${settings.format.toLowerCase()}`
  //     );
  //     // 5. Get the processed video data
  //     const data = ffmpeg.FS('readFile', `output.${settings.format.toLowerCase()}`);
  //     // 6. Create a download URL
  //     const blob = new Blob([data.buffer], { type: `video/${settings.format.toLowerCase()}` });
  //     const url = URL.createObjectURL(blob);
  //     // 7. Trigger download
  //     return { url, filename: `project-${projectId}.${settings.format.toLowerCase()}` };
  //   } catch (error) {
  //     console.error('Export failed:', error);
  //     throw new Error('Failed to export project');
  //   }
}
