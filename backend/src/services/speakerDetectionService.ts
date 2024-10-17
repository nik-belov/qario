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

    let prevSpeakerId: number | null = null;
    let prevBbox: { xMin: number, xMax: number, yMin: number, yMax: number } | null = null;

    speakingFrames.forEach((frame, index) => {
      const nextFrame = speakingFrames[index + 1] || { startTime: frame.startTime + 0.5 };
      const duration = nextFrame.startTime - frame.startTime;

      if (frame.speakerId === -1) {
        filterComplex += `[0:v]trim=start=${frame.startTime}:duration=${duration},setpts=PTS-STARTPTS,setsar=1[v${index}];`;
        prevSpeakerId = null;
        prevBbox = null;
      } else {
        let [xMin, yMin] = frame.bbox.topLeft;
        let [xMax, yMax] = frame.bbox.bottomRight;
        
        const expandFactor = 2;
        const centerX = (xMin + xMax) / 2;
        const centerY = (yMin + yMax) / 2;
        const boxWidth = (xMax - xMin) * expandFactor;
        const boxHeight = (yMax - yMin) * expandFactor * 2;

        // Check if we should update the bounding box
        const shouldUpdate = !prevBbox || 
                            frame.speakerId !== prevSpeakerId ||
                            Math.abs(centerX - (prevBbox.xMin + prevBbox.xMax) / 2) > boxWidth / 4 ||
                            Math.abs(centerY - (prevBbox.yMin + prevBbox.yMax) / 2) > boxHeight / 4;

        if (shouldUpdate) {
          xMin = Math.max(0, centerX - boxWidth / 2);
          xMax = Math.min(width, centerX + boxWidth / 2);
          yMin = Math.max(0, centerY - boxHeight / 2);
          yMax = Math.min(height, centerY + boxHeight / 2);

          prevSpeakerId = frame.speakerId;
          prevBbox = { xMin, xMax, yMin, yMax };
          console.log(prevBbox);
        } else {
          // Use the previous bounding box
          if (prevBbox) {
            ({ xMin, xMax, yMin, yMax } = prevBbox);
          } else {
            // Handle the case where prevBbox is null, if necessary
            xMin = 0;
            xMax = width;
            yMin = 0;
            yMax = height;
          }
        }

        const cropWidth = xMax - xMin;
        const cropHeight = yMax - yMin;
        
        // Calculate zoom factor
        const zoomFactor = Math.min(width / cropWidth, height / cropHeight);

        filterComplex += `[0:v]trim=start=${frame.startTime}:duration=${duration},setpts=PTS-STARTPTS,`;
        filterComplex += `crop=${cropWidth}:${cropHeight}:${xMin}:${yMin},`;
        filterComplex += `scale=${width}:${height}:force_original_aspect_ratio=increase,`;
        filterComplex += `crop=${width}:${height},setsar=1[v${index}];`;
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
          // console.warn(`ffmpeg stderr: ${data}`);
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
