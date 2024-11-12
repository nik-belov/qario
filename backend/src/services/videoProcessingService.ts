import { downloadFileFromS3, uploadFileToS3 } from './s3Service';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { log, promisify } from 'util';
import axios from 'axios';
import FormData from 'form-data';
import { runPythonScript } from './pythonBridge';
import os from 'os';

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

export async function detectSpeakerAndZoom(
  videoUrl: string,
  projectId: string
): Promise<string> {
  const tempDir = path.join(os.tmpdir(), 'speaker_detection');
  await fs.promises.mkdir(tempDir, { recursive: true });

  const inputVideo = path.join(tempDir, `${projectId}_input.mp4`);
  const outputVideo = path.join(tempDir, `${projectId}_processed.mp4`);

  try {
    await downloadFileFromS3(videoUrl, inputVideo);
    console.log(`Input video downloaded to: ${inputVideo}`);

    const result = await runPythonScript('speaker_detection_zoom.py', [
      inputVideo,
      outputVideo,
      projectId,
    ]);

    const outputBuffer = await fs.promises.readFile(outputVideo);
    const processedFileName = path.basename(outputVideo);
    const processedVideoUrl = await uploadFileToS3(
      outputBuffer,
      `${projectId}/${processedFileName}`,
      'video/mp4'
    );
    console.log(`Processed video uploaded successfully: ${processedVideoUrl}`);

    await fs.promises.unlink(inputVideo);
    await fs.promises.unlink(outputVideo);

    return processedVideoUrl;
  } catch (error) {
    console.error('Error in detectSpeakerAndZoom:', error);
    throw error;
  }
}

interface AudioParams {
  noise_reduction?: number;
  low_cut?: number;
  high_cut?: number;
  compression_threshold?: number;
  compression_ratio?: number;
}

interface SpeakerBias {
  left?: number;
  main?: number;
  right?: number;
}

interface ProcessingParams {
  speaker_bias?: SpeakerBias;
  min_clip_duration?: number;
  audio_params?: AudioParams;
}

export async function syncDetectAndSwap({
  projectId,
  userId,
  leftCamera,
  mainCamera,
  rightCamera,
  leftAudio,
  rightAudio,
  processingParams
}: {
  projectId: string;
  userId: string;
  leftCamera: string;
  mainCamera: string;
  rightCamera: string;
  leftAudio: string;
  rightAudio: string;
  processingParams?: ProcessingParams;
}): Promise<string> {
  const tempDir = path.join(os.tmpdir(), 'sync_detect_swap');
  await fs.promises.mkdir(tempDir, { recursive: true });

  const localLeftCamera = path.join(tempDir, 'left_camera.mp4');
  const localMainCamera = path.join(tempDir, 'main_camera.mp4');
  const localRightCamera = path.join(tempDir, 'right_camera.mp4');
  const localLeftAudio = path.join(tempDir, 'left_audio.wav');
  const localRightAudio = path.join(tempDir, 'right_audio.wav');
  const outputVideo = path.join(tempDir, `${projectId}_processed.mp4`);

  try {
    // Download all input files
    await Promise.all([
      downloadFileFromS3(leftCamera, localLeftCamera),
      downloadFileFromS3(mainCamera, localMainCamera),
      downloadFileFromS3(rightCamera, localRightCamera),
      downloadFileFromS3(leftAudio, localLeftAudio),
      downloadFileFromS3(rightAudio, localRightAudio),
    ]);

    console.log('All input files downloaded successfully');

    // Run the Python script for sync detection and camera swapping
    const args = [
      localLeftCamera,
      localMainCamera,
      localRightCamera,
      localLeftAudio,
      localRightAudio,
      outputVideo,
      projectId,
    ];

    // Add processing parameters if provided
    if (processingParams) {
      args.push(JSON.stringify(processingParams));
    }

    const result = await runPythonScript('sync_detect_swap.py', args);

    console.log('Python script executed successfully:', result);

    // Upload the processed video
    const outputBuffer = await fs.promises.readFile(outputVideo);
    const processedFileName = `${projectId}_synced_and_swapped.mp4`;
    const processedVideoUrl = await uploadFileToS3(
      outputBuffer,
      `${projectId}/${processedFileName}`,
      'video/mp4'
    );
    console.log(`Processed video uploaded successfully: ${processedVideoUrl}`);

    // Clean up temporary files
    await Promise.all([
      fs.promises.unlink(localLeftCamera),
      fs.promises.unlink(localMainCamera),
      fs.promises.unlink(localRightCamera),
      fs.promises.unlink(localLeftAudio),
      fs.promises.unlink(localRightAudio),
      fs.promises.unlink(outputVideo),
    ]);

    return processedVideoUrl;
  } catch (error) {
    console.error('Error in syncDetectAndSwap:', error);
    throw error;
  }
}

export async function matchAudioVideo(
  audioUrl: string,
  videoUrl: string
): Promise<string> {
  const tempDir = '/tmp/audio_video_match';
  await fs.promises.mkdir(tempDir, { recursive: true });

  const inputAudio = path.join(tempDir, 'input_audio.wav');
  const inputVideo = path.join(tempDir, 'input_video.mp4');
  const outputVideo = path.join(tempDir, 'output.mp4');

  // Download the input files
  await Promise.all([
    downloadFileFromS3(audioUrl, inputAudio),
    downloadFileFromS3(videoUrl, inputVideo),
  ]);

  // Use ffmpeg with cremapv filter to sync audio and video
  const ffmpegCommand = `
    ffmpeg -i ${inputVideo} -i ${inputAudio} -filter_complex "
    [0:v]scale=640:480,fps=30[v];
    [1:a]aresample=48000[a];
    [v][a]cremapv=window=1:step=0:algo=exact[v][a]
    " -map "[v]" -map "[a]" -c:v libx264 -c:a aac -strict experimental ${outputVideo}
  `;

  await execPromise(ffmpegCommand);

  // Upload the matched video
  const matchedVideoBuffer = await fs.promises.readFile(outputVideo);
  const matchedFileName = `matched_${path.basename(videoUrl)}`;
  const matchedVideoUrl = await uploadFileToS3(
    matchedVideoBuffer,
    matchedFileName,
    'video/mp4'
  );

  // Clean up temporary files
  await fs.promises.unlink(inputAudio);
  await fs.promises.unlink(inputVideo);
  await fs.promises.unlink(outputVideo);

  console.log('Audio-video lip sync completed:', matchedFileName);
  return matchedVideoUrl;
}

export async function analyzeVideoContent(videoUrl: string): Promise<{
  transcript: string;
  frameDescriptions: { [second: number]: string };
}> {
  const tempDir = '/tmp/video_analysis';
  await fs.promises.mkdir(tempDir, { recursive: true });

  const inputVideo = path.join(tempDir, 'input.mp4');
  const audioFile = path.join(tempDir, 'audio.mp3');
  const framesDir = path.join(tempDir, 'frames');

  await fs.promises.mkdir(framesDir, { recursive: true });

  // Download the input video
  await downloadFileFromS3(videoUrl, inputVideo);

  // Extract audio from video
  await execPromise(`ffmpeg -i ${inputVideo} -q:a 0 -map a ${audioFile}`);

  // Generate frames (1 per second)
  await execPromise(
    `ffmpeg -i ${inputVideo} -vf fps=1 ${framesDir}/frame%d.jpg`
  );

  // Get video duration
  const { stdout: durationOutput } = await execPromise(
    `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 ${inputVideo}`
  );
  const duration = Math.floor(parseFloat(durationOutput));

  // Transcribe audio using OpenAI Whisper API
  const transcript = await transcribeAudio(audioFile);

  // Analyze frames using OpenAI API
  const frameDescriptions: { [second: number]: string } = {};
  for (let i = 1; i <= duration; i++) {
    const framePath = path.join(framesDir, `frame${i}.jpg`);
    if (fs.existsSync(framePath)) {
      frameDescriptions[i] = await describeImage(framePath);
    }
  }

  // Clean up temporary files
  await fs.promises.unlink(inputVideo);
  await fs.promises.unlink(audioFile);
  await fs.promises.rm(framesDir, { recursive: true });

  return { transcript, frameDescriptions };
}

async function transcribeAudio(audioFilePath: string): Promise<string> {
  const formData = new FormData();
  formData.append('file', fs.createReadStream(audioFilePath));
  formData.append('model', 'whisper-1');

  const response = await axios.post(
    'https://api.openai.com/v1/audio/transcriptions',
    formData,
    {
      headers: {
        ...formData.getHeaders(),
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
    }
  );

  return response.data.text;
}

async function describeImage(imagePath: string): Promise<string> {
  const imageBuffer = await fs.promises.readFile(imagePath);
  const base64Image = imageBuffer.toString('base64');

  const response = await axios.post(
    'https://api.openai.com/v1/chat/completions',
    {
      model: 'gpt-4-vision-preview',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: "Describe what's happening in this image in a single sentence.",
            },
            {
              type: 'image_url',
              image_url: { url: `data:image/jpeg;base64,${base64Image}` },
            },
          ],
        },
      ],
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
    }
  );

  return response.data.choices[0].message.content;
}

interface Segment {
  start: number;
  end: number;
}

export async function trimVideoBasedOnContent(
  videoUrl: string,
  transcript: string,
  frameDescriptions: { [second: number]: string },
  prompt: string
): Promise<{ trimmedVideoUrl: string; cuts: Segment[] }> {
  const tempDir = '/tmp/video_trimming';
  await fs.promises.mkdir(tempDir, { recursive: true });

  const inputVideo = path.join(tempDir, 'input.mp4');
  const outputVideo = path.join(tempDir, 'output.mp4');

  // Download the input video
  await downloadFileFromS3(videoUrl, inputVideo);

  // Determine which segments to keep
  const segments = await determineSegmentsToKeep(
    transcript,
    frameDescriptions,
    prompt
  );

  // Generate FFmpeg filter complex command
  let filterComplex = segments
    .map((segment, index) => {
      return (
        `[0:v]trim=${segment.start}:${segment.end},setpts=PTS-STARTPTS[v${index}];` +
        `[0:a]atrim=${segment.start}:${segment.end},asetpts=PTS-STARTPTS[a${index}];`
      );
    })
    .join('');

  filterComplex +=
    segments.map((_, index) => `[v${index}][a${index}]`).join('') +
    `concat=n=${segments.length}:v=1:a=1[outv][outa]`;

  // Trim the video using FFmpeg
  const ffmpegCommand = `ffmpeg -i ${inputVideo} -filter_complex "${filterComplex}" -map "[outv]" -map "[outa]" ${outputVideo}`;
  await execPromise(ffmpegCommand);

  // Upload the trimmed video
  const trimmedVideoBuffer = await fs.promises.readFile(outputVideo);
  const trimmedFileName = `trimmed_${path.basename(videoUrl)}`;
  const trimmedVideoUrl = await uploadFileToS3(
    trimmedVideoBuffer,
    trimmedFileName,
    'video/mp4'
  );

  // Clean up temporary files
  await fs.promises.unlink(inputVideo);
  await fs.promises.unlink(outputVideo);

  console.log('Video trimming completed:', trimmedFileName);
  return { trimmedVideoUrl, cuts: segments };
}

async function determineSegmentsToKeep(
  transcript: string,
  frameDescriptions: { [second: number]: string },
  prompt: string
): Promise<Segment[]> {
  const response = await axios.post(
    'https://api.openai.com/v1/chat/completions',
    {
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content:
            "You are an AI assistant that helps determine which segments of a video to keep based on a transcript, frame descriptions, and a prompt. Your task is to analyze the content and return an array of segments to keep, where each segment is an object with 'start' and 'end' properties representing seconds in the video.",
        },
        {
          role: 'user',
          content: `Transcript: ${transcript}\n\nFrame Descriptions: ${JSON.stringify(
            frameDescriptions
          )}\n\nPrompt: ${prompt}\n\nBased on this information, determine which segments of the video should be kept. Return your answer as a JSON array of objects, each with 'start' and 'end' properties representing seconds.`,
        },
      ],
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
    }
  );

  const segments: Segment[] = JSON.parse(
    response.data.choices[0].message.content
  );
  return segments;
}
