import * as tf from '@tensorflow/tfjs-node';
import * as blazeface from '@tensorflow-models/blazeface';
import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';

let model: blazeface.BlazeFaceModel;

async function loadModel() {
  model = await blazeface.load();
}

interface FaceDetection {
  boundingBox: {
    topLeft: [number, number];
    bottomRight: [number, number];
  };
  landmarks: Array<[number, number]>;
}

async function detectFacesAndLandmarks(imagePath: string): Promise<FaceDetection[]> {
  if (!model) {
    await loadModel();
  }

  const imageBuffer = fs.readFileSync(imagePath);
  const tfImage = tf.node.decodeImage(imageBuffer);
  const faces = await model.estimateFaces(tfImage as tf.Tensor3D, false);

  tfImage.dispose();

  return faces.map(face => ({
    boundingBox: {
      topLeft: face.topLeft as [number, number],
      bottomRight: face.bottomRight as [number, number]
    },
    landmarks: face.landmarks as Array<[number, number]>
  }));
}

function analyzeLipMovement(prevLandmarks: Array<[number, number]>, currentLandmarks: Array<[number, number]>): number {
  const [prevX, prevY] = prevLandmarks[5];
  const [currentX, currentY] = currentLandmarks[5];
  
  return Math.sqrt(Math.pow(currentX - prevX, 2) + Math.pow(currentY - prevY, 2));
}

const DEBUG = process.env.DEBUG === 'true';

export async function processVideo(inputVideo: string, outputVideo: string, framesDir: string) {
  try {
    // Ensure output directory exists
    const outputDir = path.dirname(outputVideo);
    fs.mkdirSync(outputDir, { recursive: true });

    const frameFiles = fs.readdirSync(framesDir).sort();
    let prevLandmarks: Array<Array<[number, number]>> = [];
    let speakingFrames: Array<{ startTime: number, speakerId: number, bbox: { topLeft: [number, number], bottomRight: [number, number] } }> = [];
    let lastMovementTime = 0;

    // Analyze frames twice per second
    for (let i = 0; i < frameFiles.length; i += 15) {
      const framePath = path.join(framesDir, frameFiles[i]);
      const detections = await detectFacesAndLandmarks(framePath);

      let maxMovement = 0;
      let speakerId = -1;
      let speakerBbox = { topLeft: [0, 0], bottomRight: [1, 1] };

      for (let j = 0; j < detections.length; j++) {
        const landmarks = detections[j].landmarks;

        if (prevLandmarks[j]) {
          const movement = analyzeLipMovement(prevLandmarks[j], landmarks);
          if (movement > maxMovement) {
            maxMovement = movement;
            speakerId = j;
            speakerBbox = detections[j].boundingBox;
          }
        }

        if (prevLandmarks.length <= j) {
          prevLandmarks.push(landmarks);
        } else {
          prevLandmarks[j] = landmarks;
        }
      }

      const currentTime = i / 30;
      
      if (maxMovement > 0.02) {
        lastMovementTime = currentTime;
      }

      if (currentTime - lastMovementTime > 1) {
        speakerId = -1;
        speakerBbox = { topLeft: [0, 0], bottomRight: [1, 1] };
      }

      speakingFrames.push({
        startTime: currentTime,
        speakerId: speakerId,
        bbox: {
          topLeft: [speakerBbox.topLeft[0], speakerBbox.topLeft[1]],
          bottomRight: [speakerBbox.bottomRight[0], speakerBbox.bottomRight[1]]
        }
      });
    }

    if (DEBUG) {
      // Generate debug video with bounding boxes
      const debugOutputVideo = path.join(outputDir, 'debug_bounding_boxes_' + path.basename(outputVideo));
      await generateDebugVideo(inputVideo, debugOutputVideo, speakingFrames);
      console.log(`Debug video saved to: ${debugOutputVideo}`);
    }

    // Generate complex filter for zooming and panning
    let filterComplex = '';
    const { width, height } = await getVideoDimensions(inputVideo);

    // New zoom-related variables
    interface ZoomState {
      zoomFactor: number;
      centerX: number;
      centerY: number;
    }

    let prevZoomState: ZoomState | null = null;
    const zoomTransitionDuration = 1.0; // seconds
    const zoomDelay = 0.5; // seconds

    // Assume we have the original video dimensions
    const originalAspectRatio = width / height;

    // Define min and max zoom levels
    const minZoom = 1.0;  // No zoom
    const maxZoom = 1.5;  // 50% zoom

    speakingFrames.forEach((frame, index) => {
      const nextFrame = speakingFrames[index + 1] || { startTime: frame.startTime + 0.5 };
      const duration = nextFrame.startTime - frame.startTime;

      if (frame.speakerId === -1) {
        filterComplex += `[0:v]trim=start=${frame.startTime}:duration=${duration},setpts=PTS-STARTPTS[v${index}];`;
        prevZoomState = null;
      } else {
        const [xMin, yMin] = frame.bbox.topLeft;
        const [xMax, yMax] = frame.bbox.bottomRight;
        const bboxWidth = Math.max(0.001, xMax - xMin);
        const bboxHeight = Math.max(0.001, yMax - yMin);
        
        const centerX = xMin + bboxWidth / 2;
        const centerY = yMin + bboxHeight / 2;
        
        // Calculate the target zoom factor
        const faceSize = Math.max(bboxWidth, bboxHeight, 0.001);
        const targetZoomFactor = Math.min(maxZoom, Math.max(minZoom, 0.5 / faceSize));
        
        let startZoomState: ZoomState = prevZoomState || { zoomFactor: minZoom, centerX: 0.5, centerY: 0.5 };

        const targetZoomState: ZoomState = {
          zoomFactor: targetZoomFactor,
          centerX: centerX,
          centerY: centerY
        };

        const frameInterval = 10; // Apply zoom every 10 frames
        let zoomCommands = '';
        const steps = Math.ceil(duration * 30 / frameInterval); // Assuming 30 fps

        for (let step = 0; step < steps; step++) {
          const t = step / (steps - 1);
          const delayedT = Math.max(0, Math.min(1, (t * duration - zoomDelay) / (duration - zoomDelay)));

          const currentZoomState: ZoomState = {
            zoomFactor: startZoomState.zoomFactor + (targetZoomState.zoomFactor - startZoomState.zoomFactor) * delayedT,
            centerX: startZoomState.centerX + (targetZoomState.centerX - startZoomState.centerX) * delayedT,
            centerY: startZoomState.centerY + (targetZoomState.centerY - startZoomState.centerY) * delayedT
          };

          currentZoomState.zoomFactor = Math.max(currentZoomState.zoomFactor, 0.001);

          const cropSize = Math.min(1, 1 / currentZoomState.zoomFactor);
          const cropX = Math.max(0, Math.min(1 - cropSize, currentZoomState.centerX - cropSize / 2));
          const cropY = Math.max(0, Math.min(1 - cropSize, currentZoomState.centerY - cropSize / 2));

          if (isFinite(cropSize) && isFinite(cropX) && isFinite(cropY)) {
            const scaledWidth = Math.round(width * cropSize);
            const scaledHeight = Math.round(height * cropSize);
            
            if (scaledWidth > 0 && scaledHeight > 0) {
              zoomCommands += `crop=iw*${roundToSigFigs(cropSize)}:ih*${roundToSigFigs(cropSize)}:iw*${roundToSigFigs(cropX)}:ih*${roundToSigFigs(cropY)},scale=${scaledWidth}:${scaledHeight},pad=${width}:${height}:(${width}-iw)/2:(${height}-ih)/2,setsar=1:1,`;
            } else {
              console.error(`Invalid scale dimensions at step ${step}: ${scaledWidth}x${scaledHeight}. Skipping this frame.`);
            }
          } else {
            console.error(`Invalid crop values at step ${step}. Skipping this frame.`);
          }
        }

        // Remove trailing comma
        zoomCommands = zoomCommands.replace(/,$/, '');

        filterComplex += `[0:v]trim=start=${frame.startTime}:duration=${duration},setpts=PTS-STARTPTS,${zoomCommands}[v${index}];`;

        prevZoomState = targetZoomState;
      }
    });

    filterComplex += speakingFrames.map((_, index) => `[v${index}]`).join('');
    filterComplex += `concat=n=${speakingFrames.length}:v=1:a=0[outv]`;

    // Generate ffmpeg command arguments
    const ffmpegArgs = [
      '-y',
      '-i', inputVideo,
      '-filter_complex', filterComplex,
      '-map', '[outv]',
      '-map', '0:a',
      outputVideo
    ];

    // Execute ffmpeg command
    console.log("Starting ffmpeg command execution...");
    try {
      await new Promise<void>((resolve, reject) => {
        const ffmpeg = spawn('ffmpeg', ffmpegArgs);

        let stdoutBuffer = '';
        let stderrBuffer = '';

        ffmpeg.stdout.on('data', (data) => {
          stdoutBuffer += data.toString();
          console.log(`ffmpeg stdout: ${data}`);
        });

        ffmpeg.stderr.on('data', (data) => {
          stderrBuffer += data.toString();
          console.warn(`ffmpeg stderr: ${data}`);
        });

        ffmpeg.on('close', (code) => {
          if (code === 0) {
            console.log('ffmpeg process completed successfully');
            resolve();
          } else {
            console.error(`ffmpeg process exited with code ${code}`);
            console.error('stdout:', stdoutBuffer);
            console.error('stderr:', stderrBuffer);
            reject(new Error(`ffmpeg process exited with code ${code}`));
          }
        });

        ffmpeg.on('error', (err) => {
          console.error('Failed to start ffmpeg process:', err);
          reject(err);
        });
      });
      console.log("ffmpeg command executed successfully");
    } catch (error) {
      console.error("Error during ffmpeg command execution:", error);
      throw error;
    }

    // Log filename and save locally if DEBUG is true
    if (DEBUG) {
      const debugZoomOutputVideo = path.join(outputDir, 'debug_zoom_' + path.basename(outputVideo));
      fs.copyFileSync(outputVideo, debugZoomOutputVideo);
      console.log(`Debug zoom video saved to: ${debugZoomOutputVideo}`);
    }

    console.log(`Final video with zooms saved to: ${outputVideo}`);

  } catch (error) {
    console.error("Error processing video:", error);
    throw error;
  }
}

function roundToSigFigs(num: number, sigFigs: number = 3): number {
  if (num === 0) return 0;
  const magnitude = Math.floor(Math.log10(Math.abs(num))) + 1;
  const scale = Math.pow(10, sigFigs - magnitude);
  return Math.round(num * scale) / scale;
}

async function generateDebugVideo(inputVideo: string, debugOutputVideo: string, speakingFrames: Array<{ startTime: number, speakerId: number, bbox: { topLeft: [number, number], bottomRight: [number, number] } }>) {
  // First, get the video dimensions
  const { width, height } = await getVideoDimensions(inputVideo);

  let filterComplex = '';
  let lastSpeakingFrame: typeof speakingFrames[0] | null = null;
  let lastSpeakingTime = -1;

  speakingFrames.forEach((frame, index) => {
    const duration = index < speakingFrames.length - 1 ? speakingFrames[index + 1].startTime - frame.startTime : 0.5;
    
    if (frame.speakerId !== -1) {
      lastSpeakingFrame = frame;
      lastSpeakingTime = frame.startTime;
    } else if (lastSpeakingFrame && frame.startTime - lastSpeakingTime > 1) {
      lastSpeakingFrame = null;
    }

    if (lastSpeakingFrame) {
      const [xMin, yMin] = lastSpeakingFrame.bbox.topLeft;
      const [xMax, yMax] = lastSpeakingFrame.bbox.bottomRight;
      
      filterComplex += `[0:v]trim=start=${frame.startTime}:duration=${duration},setpts=PTS-STARTPTS,`;
      filterComplex += `drawbox=x=${xMin}:y=${yMin}:w=${xMax-xMin}:h=${yMax-yMin}:color=red:t=2,`;
      filterComplex += `drawtext=text='Speaker ${lastSpeakingFrame.speakerId}':x=${xMin}:y=${yMin-30}:fontcolor=white:fontsize=24:box=1:boxcolor=red@0.5:boxborderw=5[v${index}];`;
    } else {
      filterComplex += `[0:v]trim=start=${frame.startTime}:duration=${duration},setpts=PTS-STARTPTS[v${index}];`;
    }
  });

  filterComplex += speakingFrames.map((_, index) => `[v${index}]`).join('');
  filterComplex += `concat=n=${speakingFrames.length}:v=1:a=0[outv]`;

  const ffmpegCommand = [
    '-y',
    '-i', inputVideo,
    '-filter_complex', filterComplex,
    '-map', '[outv]',
    '-map', '0:a',
    debugOutputVideo
  ];

  return new Promise((resolve, reject) => {
    const ffmpeg = spawn('ffmpeg', ffmpegCommand);

    let stdoutData = '';
    let stderrData = '';

    ffmpeg.stdout.on('data', (data) => {
      stdoutData += data;
    });

    ffmpeg.stderr.on('data', (data) => {
      stderrData += data;
    });

    ffmpeg.on('close', (code) => {
      if (code === 0) {
        console.log('Debug video generated successfully');
        resolve('Debug video generated successfully');
      } else {
        console.error(`FFmpeg process exited with code ${code}`);
        console.error('stdout:', stdoutData);
        console.error('stderr:', stderrData);
        reject(new Error(`FFmpeg process exited with code ${code}`));
      }
    });
  });
}

// Helper function to get video dimensions
function getVideoDimensions(videoPath: string): Promise<{width: number, height: number}> {
  return new Promise((resolve, reject) => {
    const ffprobe = spawn('ffprobe', [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-count_packets', '-show_entries', 'stream=width,height',
      '-of', 'csv=p=0',
      videoPath
    ]);

    let output = '';
    ffprobe.stdout.on('data', (data) => {
      output += data.toString();
    });

    ffprobe.on('close', (code) => {
      if (code === 0) {
        const [width, height] = output.trim().split(',').map(Number);
        resolve({width, height});
      } else {
        reject(new Error(`ffprobe process exited with code ${code}`));
      }
    });
  });
}
