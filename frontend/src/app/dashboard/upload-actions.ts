'use server';

import { PutObjectCommand } from '@aws-sdk/client-s3';
import {
  addProjectFile,
  createProject,
  updateProjectFinalVideo,
  deleteFile,
  getProjectFiles,
} from '@/server/queries';
import { env } from '@/env';
import { s3Client } from '@/lib/s3';
import { redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';

// Helper function to upload file to S3
async function uploadFileToS3(
  fileBuffer: Buffer,
  fileName: string,
  fileType: string
) {
  const params = {
    Bucket: env.AWS_S3_BUCKET_NAME,
    Key: fileName,
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
    const fileName = `${fileType}-${Date.now()}-${file.name}`;
    await uploadFileToS3(buffer, fileName, file.type);

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
      fileName,
      `https://${env.AWS_S3_BUCKET_NAME}.s3.amazonaws.com/${fileName}`,
      file.type
    );

    uploadedFiles[fileField] = fileMetadata.fileKey;

    console.log('File metadata added to database');
  }

  console.log('All files uploaded successfully.');

  // Make POST request to backend server
  try {
    const response = await fetch(`${env.BACKEND_URL}/process`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        projectId,
        userId: auth().userId,
        leftCamera: uploadedFiles.leftCamera,
        mainCamera: uploadedFiles.mainCamera,
        rightCamera: uploadedFiles.rightCamera,
        leftAudio: uploadedFiles.leftAudio,
        rightAudio: uploadedFiles.rightAudio,
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to start processing');
    }

    const data = await response.json();
    if (data.finalVideoUrl) {
      // Save finalVideoUrl in the database
      await updateProjectFinalVideo(projectId, data.finalVideoUrl);
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

export async function cutVideo(
  projectId: number,
  cutStartTime: number
) {
  try {
    console.log("CUTTING")
    const files = await getProjectFiles(projectId);
    const leftCamera = files.find(f => f.type === 'leftCamera')?.url || '';
    const mainCamera = files.find(f => f.type === 'mainCamera')?.url || '';
    const rightCamera = files.find(f => f.type === 'rightCamera')?.url || '';

    const response = await fetch(`${env.BACKEND_URL}/cut`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId,
        leftCamera,
        mainCamera,
        rightCamera,
        cutStartTime,
      }),
    });

    console.log("RESPONSE", response)

    if (!response.ok) throw new Error('Failed to cut video');

    const result = await response.json();

    // Upload the new cut videos to S3
    const uploadPromises = Object.entries(result).map(async ([camera, url]) => {
      const fileName = `cut-${camera}-${Date.now()}.mp4`;
      console.log("URL", url)
      const response = await fetch(url);
      const buffer = await response.arrayBuffer();

      await uploadFileToS3(Buffer.from(buffer), fileName, 'video/mp4');

      const newUrl = `https://${env.AWS_S3_BUCKET_NAME}.s3.amazonaws.com/${fileName}`;
      await addProjectFile(projectId, camera as any, fileName, newUrl, 'video/mp4');

      return { [camera]: newUrl };
    });

    const uploadedFiles = await Promise.all(uploadPromises);
    const newUrls = Object.assign({}, ...uploadedFiles);

    // Update the project's final video URL (assuming we use the main camera as the final video)
    await updateProjectFinalVideo(projectId, newUrls.mainCamera);

    return { status: 'success', message: 'Video cut successfully', newUrls };
  } catch (error) {
    console.error('Error cutting video:', error);
    return { status: 'error', message: 'Failed to cut video' };
  }
}

export async function trimVideo(
  projectId: number,
  startTime: number,
  endTime: number
) {
  try {
    const files = await getProjectFiles(projectId);
    const leftCamera = files.find(f => f.type === 'leftCamera')?.url || '';
    const mainCamera = files.find(f => f.type === 'mainCamera')?.url || '';
    const rightCamera = files.find(f => f.type === 'rightCamera')?.url || '';

    const response = await fetch(`${env.BACKEND_URL}/trim`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId,
        leftCamera,
        mainCamera,
        rightCamera,
        startTime,
        endTime,
      }),
    });

    if (!response.ok) throw new Error('Failed to trim video');

    const result = await response.json();

    // Upload the new trimmed videos to S3
    const uploadPromises = Object.entries(result).map(async ([camera, url]) => {
      const fileName = `trimmed-${camera}-${Date.now()}.mp4`;
      const response = await fetch(url);
      const buffer = await response.arrayBuffer();

      await uploadFileToS3(Buffer.from(buffer), fileName, 'video/mp4');

      const newUrl = `https://${env.AWS_S3_BUCKET_NAME}.s3.amazonaws.com/${fileName}`;
      await addProjectFile(projectId, camera as any, fileName, newUrl, 'video/mp4');

      return { [camera]: newUrl };
    });

    const uploadedFiles = await Promise.all(uploadPromises);
    const newUrls = Object.assign({}, ...uploadedFiles);

    // Update the project's final video URL (assuming we use the main camera as the final video)
    await updateProjectFinalVideo(projectId, newUrls.mainCamera);

    return { status: 'success', message: 'Video trimmed successfully', newUrls };
  } catch (error) {
    console.error('Error trimming video:', error);
    return { status: 'error', message: 'Failed to trim video' };
  }
}

export async function deleteFileAction(fileId: number) {
  try {
    await deleteFile(fileId);
    return { status: 'success', message: 'File deleted successfully' };
  } catch (error) {
    console.error('Error deleting file:', error);
    return { status: 'error', message: 'Failed to delete file' };
  }
}
