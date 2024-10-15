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
  projectId: string;
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
    downloadFileFromS3(`${projectId}/${leftCamera}`, localLeftCamera),
    downloadFileFromS3(`${projectId}/${mainCamera}`, localMainCamera),
    downloadFileFromS3(`${projectId}/${rightCamera}`, localRightCamera),
    downloadFileFromS3(`${projectId}/${leftAudio}`, localLeftAudio),
    downloadFileFromS3(`${projectId}/${rightAudio}`, localRightAudio),
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
  const finalFileName = `${projectId}/final_output.mp4`;
  const finalVideoUrl = await uploadFileToS3(
    finalVideoBuffer,
    finalFileName,
    'video/mp4'
  );

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
