'use server';

import { PutObjectCommand } from '@aws-sdk/client-s3';
import {
  addProjectFile,
  createProject,
  updateProjectFinalVideo,
} from '@/server/queries';
import { env } from '@/env';
import { s3Client } from '@/lib/s3';
import { redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { projects } from '@/server/db/schema';
import { eq } from 'drizzle-orm';
import { db } from '@/server/db';
import { supabase } from '@/lib/supabase';

// Helper function to upload file to S3
async function uploadFileToS3(
  fileBuffer: Buffer,
  fileName: string,
  fileType: string,
  projectId: string
) {
  const params = {
    Bucket: env.AWS_S3_BUCKET_NAME,
    Key: `${projectId}/${fileName}`,
    Body: fileBuffer,
    ContentType: fileType,
  };

  const command = new PutObjectCommand(params);
  try {
    const response = await s3Client.send(command);
    console.log('File uploaded successfully:', response);
    return fileName;
  } catch (error) {
    throw new Error(`Failed to upload file to S3: ${error}`);
  }
}

// Main server action to handle multiple file uploads
export async function uploadFile(
  state: { message: string; status: string },
  formData: FormData
) {
  const projectName = formData.get('projectName') as string;
  if (!projectName) {
    return { status: 'error', message: 'Project name is required.' };
  }

  // Create the project and get the project ID
  const project = await createProject(projectName);
  const projectId = project.id;

  const fileMappings = [
    { fileField: 'leftCamera', fileType: 'left_camera' },
    { fileField: 'mainCamera', fileType: 'main_camera' },
    { fileField: 'rightCamera', fileType: 'right_camera' },
    { fileField: 'leftAudio', fileType: 'left_audio' },
    { fileField: 'rightAudio', fileType: 'right_audio' },
  ];

  const uploadedFiles: Record<string, string> = {};

  for (const { fileField, fileType } of fileMappings) {
    const file = formData.get(fileField) as File | null;
    if (!file || !(file instanceof File) || file.size === 0) {
      return {
        status: 'error',
        message: `Missing or invalid file for ${fileField}`,
      };
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // Upload file to S3
    const fileKey = await uploadFileToS3(
      buffer,
      file.name,
      file.type,
      projectId
    );

    const fileTypeMapping = {
      left_camera: 'left_camera',
      main_camera: 'main_camera',
      right_camera: 'right_camera',
      left_audio: 'left_audio',
      right_audio: 'right_audio',
    } as const;

    const mappedFileType =
      fileTypeMapping[fileType as keyof typeof fileTypeMapping];
    if (!mappedFileType) {
      return { status: 'error', message: 'Invalid file type.' };
    }

    // Store file metadata in the database
    const fileMetadata = await addProjectFile(
      projectId,
      mappedFileType,
      fileKey,
      `https://${env.AWS_S3_BUCKET_NAME}.s3.amazonaws.com/${fileKey}`,
      file.type
    );

    uploadedFiles[fileField] = fileMetadata.fileKey;

    console.log('File metadata added to database');
  }

  console.log('All files uploaded successfully.');

  // Make POST request to backend server
  //   try {
  //     const response = await fetch(`${env.BACKEND_URL}/process`, {
  //       method: 'POST',
  //       headers: {
  //         'Content-Type': 'application/json',
  //       },
  //       body: JSON.stringify({
  //         projectId,
  //         userId: auth().userId,
  //         leftCamera: uploadedFiles.leftCamera,
  //         mainCamera: uploadedFiles.mainCamera,
  //         rightCamera: uploadedFiles.rightCamera,
  //         leftAudio: uploadedFiles.leftAudio,
  //         rightAudio: uploadedFiles.rightAudio,
  //       }),
  //     });

  //     if (!response.ok) {
  //       throw new Error('Failed to start processing');
  //     }

  //     const data = await response.json();
  //     if (data.finalVideoUrl) {
  //       // Save finalVideoUrl in the database
  //       await updateProjectFinalVideo(projectId, data.finalVideoUrl);
  //       console.log('Final video URL saved in the database');
  //     } else {
  //       console.warn('Final video URL not received from backend');
  //     }

  //     console.log('Processing request sent to backend');
  //   } catch (error) {
  //     console.error('Error sending processing request:', error);
  //     return { status: 'error', message: 'Failed to start processing' };
  //   }

  redirect(`/project/${projectId}`);
}

export async function uploadZoomFile(
  state: { message: string; status: string },
  formData: FormData
) {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  const projectName = formData.get('projectName') as string;
  if (!projectName) {
    return { status: 'error', message: 'Project name is required.' };
  }

  // Create the project and get the project ID
  const project = await createProject(projectName);
  const projectId = project.id;

  const zoomVideo = formData.get('zoomVideo') as File | null;
  if (!zoomVideo || !(zoomVideo instanceof File) || zoomVideo.size === 0) {
    return {
      status: 'error',
      message: 'Missing or invalid file for Zoom video',
    };
  }

  const buffer = Buffer.from(await zoomVideo.arrayBuffer());

  // Upload file to S3
  const fileKey = await uploadFileToS3(
    buffer,
    zoomVideo.name,
    zoomVideo.type,
    projectId
  );

  //   Store file metadata in the database
  const fileMetadata = await addProjectFile(
    projectId,
    'zoom_video',
    fileKey,
    `https://${env.AWS_S3_BUCKET_NAME}.s3.amazonaws.com/${fileKey}`,
    zoomVideo.type
  );

  console.log('Zoom video metadata added to database');

  // Make POST request to backend server
  try {
    const response = await fetch(`${env.BACKEND_URL}/detect-and-zoom`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        projectId,
        userId,
        videoUrl: `${projectId}/${fileKey}`,
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to start processing');
    }

    const data = await response.json();
    if (data.processedVideoUrl) {
      // Save finalVideoUrl in the database
      await updateProjectFinalVideo(projectId, data.processedVideoUrl);
      console.log('Final video URL saved in the database');
    } else {
      console.warn('Final video URL not received from backend');
    }

    console.log('Processing request sent to backend');
  } catch (error) {
    console.error('Error sending processing request:', error);
    return { status: 'error', message: 'Failed to start processing' };
  }

  redirect(`/project/${projectId}`);
}
