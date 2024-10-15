import { downloadFileFromS3, uploadFileToS3 } from './s3Service';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
const execPromise = promisify(exec);

export async function processAndUploadFiles({
  projectId,
  userId,
  leftCamera,
  mainCamera,
  rightCamera,
  leftAudio,
  rightAudio,
}: {
  projectId: number;
  userId: string;
  leftCamera: string;
  mainCamera: string;
  rightCamera: string;
  leftAudio: string;
  rightAudio: string;
}): Promise<string> {
  const tempDir = '/tmp/uploads';
  await fs.promises.mkdir(tempDir, { recursive: true });

  const localLeftCamera = path.join(tempDir, 'left_camera.mp4');
  const localMainCamera = path.join(tempDir, 'main_camera.mp4');
  const localRightCamera = path.join(tempDir, 'right_camera.mp4');
  const localLeftAudio = path.join(tempDir, 'left_audio.wav');
  const localRightAudio = path.join(tempDir, 'right_audio.wav');

  // Download the files from S3 or other storage
  await Promise.all([
    downloadFileFromS3(leftCamera, localLeftCamera),
    downloadFileFromS3(mainCamera, localMainCamera),
    downloadFileFromS3(rightCamera, localRightCamera),
    downloadFileFromS3(leftAudio, localLeftAudio),
    downloadFileFromS3(rightAudio, localRightAudio),
  ]);

  const outputFilePath = path.join(tempDir, 'final_output.mp4');

  const ffmpegCommand = `
  ffmpeg -y \
  -i ${localLeftCamera} -i ${localMainCamera} -i ${localRightCamera} \
  -i ${localLeftAudio} -i ${localRightAudio} \
  -filter_complex "
    [0:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2[v0];
    [1:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2[v1];
    [2:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2[v2];
    [v0][v1][v2]concat=n=3:v=1:a=0[outv];
    [3:a][4:a]concat=n=2:v=0:a=1[outa]
  " \
  -map "[outv]" -map "[outa]" \
  -c:v libx264 -preset medium -crf 23 \
  -c:a aac -b:a 192k \
  ${outputFilePath}
  `;

  await execPromise(ffmpegCommand);

  // Upload the final video to S3
  const finalVideoBuffer = await fs.promises.readFile(outputFilePath);
  const finalFileName = `processed/${Date.now()}/final_output.mp4`;
  const finalVideoUrl = await uploadFileToS3(finalVideoBuffer, finalFileName);

  // Clean up temporary files
  await fs.promises.unlink(localLeftCamera);
  await fs.promises.unlink(localMainCamera);
  await fs.promises.unlink(localRightCamera);
  await fs.promises.unlink(localLeftAudio);
  await fs.promises.unlink(localRightAudio);
  await fs.promises.unlink(outputFilePath);

  console.log(
    'Final podcast video processed and uploaded to S3:',
    finalFileName
  );

  return finalVideoUrl;
}

export async function cutVideo(
  projectId: number,
  leftCamera: string,
  mainCamera: string,
  rightCamera: string,
  cutStartTime: number
): Promise<{ leftCamera: string; mainCamera: string; rightCamera: string }> {
  console.log(`Cutting video for project ${projectId} at ${cutStartTime} seconds`);
  const tempDir = `/tmp/project_${projectId}_cut`;
  await fs.promises.mkdir(tempDir, { recursive: true });

  const localLeftCamera = path.join(tempDir, 'left_camera.mp4');
  const localMainCamera = path.join(tempDir, 'main_camera.mp4');
  const localRightCamera = path.join(tempDir, 'right_camera.mp4');

  console.log('Downloading files from S3...');
  await Promise.all([
    downloadFileFromS3(leftCamera, localLeftCamera),
    downloadFileFromS3(mainCamera, localMainCamera),
    downloadFileFromS3(rightCamera, localRightCamera),
  ]);
  console.log('Files downloaded successfully');

  const outputLeftCamera = path.join(tempDir, 'left_camera_cut.mp4');
  const outputMainCamera = path.join(tempDir, 'main_camera_cut.mp4');
  const outputRightCamera = path.join(tempDir, 'right_camera_cut.mp4');

  console.log('Executing FFmpeg command for cutting...');
  const ffmpegCommand = `
    ffmpeg -ss ${cutStartTime} -i ${localLeftCamera} -c copy ${outputLeftCamera} &&
    ffmpeg -ss ${cutStartTime} -i ${localMainCamera} -c copy ${outputMainCamera} &&
    ffmpeg -ss ${cutStartTime} -i ${localRightCamera} -c copy ${outputRightCamera}
  `;

  try {
    const { stdout, stderr } = await execPromise(ffmpegCommand);
    console.log('FFmpeg stdout:', stdout);
    console.log('FFmpeg stderr:', stderr);
  } catch (error) {
    console.error('FFmpeg command failed:', error);
    throw error;
  }

  console.log('Uploading cut videos to S3...');
  const [newLeftCamera, newMainCamera, newRightCamera] = await Promise.all([
    uploadFileToS3(await fs.promises.readFile(outputLeftCamera), `cut/${Date.now()}/left_camera_cut.mp4`),
    uploadFileToS3(await fs.promises.readFile(outputMainCamera), `cut/${Date.now()}/main_camera_cut.mp4`),
    uploadFileToS3(await fs.promises.readFile(outputRightCamera), `cut/${Date.now()}/right_camera_cut.mp4`),
  ]);
  console.log('Cut videos uploaded successfully');

  console.log('Cleaning up temporary files...');
  await Promise.all([
    fs.promises.unlink(localLeftCamera),
    fs.promises.unlink(localMainCamera),
    fs.promises.unlink(localRightCamera),
    fs.promises.unlink(outputLeftCamera),
    fs.promises.unlink(outputMainCamera),
    fs.promises.unlink(outputRightCamera),
  ]);
  console.log('Temporary files cleaned up');

  return { leftCamera: newLeftCamera, mainCamera: newMainCamera, rightCamera: newRightCamera };
}

export async function trimVideo(
  projectId: number,
  leftCamera: string,
  mainCamera: string,
  rightCamera: string,
  startTime: number,
  endTime: number
): Promise<{ leftCamera: string; mainCamera: string; rightCamera: string }> {
  console.log(`Trimming video for project ${projectId} from ${startTime} to ${endTime} seconds`);
  const tempDir = `/tmp/project_${projectId}_trim`;
  await fs.promises.mkdir(tempDir, { recursive: true });

  const localLeftCamera = path.join(tempDir, 'left_camera.mp4');
  const localMainCamera = path.join(tempDir, 'main_camera.mp4');
  const localRightCamera = path.join(tempDir, 'right_camera.mp4');

  console.log('Downloading files from S3...');
  await Promise.all([
    downloadFileFromS3(leftCamera, localLeftCamera),
    downloadFileFromS3(mainCamera, localMainCamera),
    downloadFileFromS3(rightCamera, localRightCamera),
  ]);
  console.log('Files downloaded successfully');

  const outputLeftCamera = path.join(tempDir, 'left_camera_trimmed.mp4');
  const outputMainCamera = path.join(tempDir, 'main_camera_trimmed.mp4');
  const outputRightCamera = path.join(tempDir, 'right_camera_trimmed.mp4');

  const duration = endTime - startTime;
  console.log('Executing FFmpeg command for trimming...');
  const ffmpegCommand = `
    ffmpeg -ss ${startTime} -i ${localLeftCamera} -t ${duration} -c copy ${outputLeftCamera} &&
    ffmpeg -ss ${startTime} -i ${localMainCamera} -t ${duration} -c copy ${outputMainCamera} &&
    ffmpeg -ss ${startTime} -i ${localRightCamera} -t ${duration} -c copy ${outputRightCamera}
  `;

  try {
    const { stdout, stderr } = await execPromise(ffmpegCommand);
    console.log('FFmpeg stdout:', stdout);
    console.log('FFmpeg stderr:', stderr);
  } catch (error) {
    console.error('FFmpeg command failed:', error);
    throw error;
  }

  console.log('Uploading trimmed videos to S3...');
  const [newLeftCamera, newMainCamera, newRightCamera] = await Promise.all([
    uploadFileToS3(await fs.promises.readFile(outputLeftCamera), `trimmed/${Date.now()}/left_camera_trimmed.mp4`),
    uploadFileToS3(await fs.promises.readFile(outputMainCamera), `trimmed/${Date.now()}/main_camera_trimmed.mp4`),
    uploadFileToS3(await fs.promises.readFile(outputRightCamera), `trimmed/${Date.now()}/right_camera_trimmed.mp4`),
  ]);
  console.log('Trimmed videos uploaded successfully');

  console.log('Cleaning up temporary files...');
  await Promise.all([
    fs.promises.unlink(localLeftCamera),
    fs.promises.unlink(localMainCamera),
    fs.promises.unlink(localRightCamera),
    fs.promises.unlink(outputLeftCamera),
    fs.promises.unlink(outputMainCamera),
    fs.promises.unlink(outputRightCamera),
  ]);
  console.log('Temporary files cleaned up');

  return { leftCamera: newLeftCamera, mainCamera: newMainCamera, rightCamera: newRightCamera };
}
