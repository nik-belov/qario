import * as tf from '@tensorflow/tfjs-node';
import * as blazeface from '@tensorflow-models/blazeface';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';

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

    // Analyze frames twice per second
    for (let i = 0; i < frameFiles.length; i += 15) {
      const framePath = path.join(framesDir, frameFiles[i]);
      const detections = await detectFacesAndLandmarks(framePath);

      let isSomeoneSpeaking = false;

      for (let j = 0; j < detections.length; j++) {
        const landmarks = detections[j].landmarks;

        if (prevLandmarks[j]) {
          const movement = analyzeLipMovement(prevLandmarks[j], landmarks);
          if (movement > 0.02) { 
            speakingFrames.push({
              startTime: i / 30,
              speakerId: j,
              bbox: detections[j].boundingBox
            });
            isSomeoneSpeaking = true;
            break;
          }
        }

        if (prevLandmarks.length <= j) {
          prevLandmarks.push(landmarks);
        } else {
          prevLandmarks[j] = landmarks;
        }
      }

      if (!isSomeoneSpeaking) {
        speakingFrames.push({
          startTime: i / 30, // Convert frame index to seconds
          speakerId: -1, // Indicates no one is speaking
          bbox: { topLeft: [0, 0], bottomRight: [1, 1] } // Full frame
        });
      }
      console.log(i, detections)
    
    }

    if (DEBUG) {
      // Generate debug video with bounding boxes
      const debugOutputVideo = path.join(outputDir, 'debug_' + path.basename(outputVideo));
      await generateDebugVideo(inputVideo, debugOutputVideo, speakingFrames);
      console.log(`Debug video saved to: ${debugOutputVideo}`);
    }

    // Generate complex filter for zooming and panning
    let filterComplex = '';
    speakingFrames.forEach((frame, index) => {
      if (frame.speakerId === -1) {
        filterComplex += `[0:v]trim=start=${frame.startTime}:duration=0.5,setpts=PTS-STARTPTS[v${index}];`;
      } else {
        const [xMin, yMin] = frame.bbox.topLeft;
        const [xMax, yMax] = frame.bbox.bottomRight;
        const width = Math.max(0.1, xMax - xMin);
        const height = Math.max(0.1, yMax - yMin);
        const zoom = Math.min(2, Math.max(1, 1 / Math.max(width, height)));
        const centerX = xMin + width / 2;
        const centerY = yMin + height / 2;
        
        filterComplex += `[0:v]trim=start=${frame.startTime}:duration=0.5,setpts=PTS-STARTPTS,`;
        filterComplex += `crop=iw:ih:${roundToSigFigs(centerX * 100 - 50/zoom)}*iw/100:${roundToSigFigs(centerY * 100 - 50/zoom)}*ih/100,`;
        filterComplex += `scale=iw*${roundToSigFigs(zoom)}:ih*${roundToSigFigs(zoom)}[v${index}];`;
      }
    });

    filterComplex += speakingFrames.map((_, index) => `[v${index}]`).join('');
    filterComplex += `concat=n=${speakingFrames.length}:v=1:a=0[outv]`;

    // Generate ffmpeg command
    const ffmpegCommand = `ffmpeg -i "${inputVideo}" -filter_complex "${filterComplex}" -map "[outv]" -map 0:a "${outputVideo}"`;

    console.log('ffmpegCommand', ffmpegCommand);
    console.log('outputVideo', outputVideo);
    console.log('speakingFrames', speakingFrames);

    // Execute ffmpeg command
    exec(ffmpegCommand, (error, stdout, stderr) => {
      if (error) {
        console.error(`Error: ${error.message}`);
        return;
      }
      if (stderr) {
        console.error(`stderr: ${stderr}`);
      }
      console.log(`stdout: ${stdout}`);
    });
  } catch (error) {
    console.error("Error processing video:", error);
  }
}

function roundToSigFigs(num: number, sigFigs: number = 3): number {
  if (num === 0) return 0;
  const magnitude = Math.floor(Math.log10(Math.abs(num))) + 1;
  const scale = Math.pow(10, sigFigs - magnitude);
  return Math.round(num * scale) / scale;
}

async function generateDebugVideo(inputVideo: string, debugOutputVideo: string, speakingFrames: Array<{ startTime: number, speakerId: number, bbox: { topLeft: [number, number], bottomRight: [number, number] } }>) {
  let filterComplex = '';
  
  speakingFrames.forEach((frame, index) => {
    const [xMin, yMin] = frame.bbox.topLeft;
    const [xMax, yMax] = frame.bbox.bottomRight;
    
    filterComplex += `[0:v]trim=start=${frame.startTime}:duration=0.5,setpts=PTS-STARTPTS,`;
    filterComplex += `drawbox=x='${xMin}*iw':y='${yMin}*ih':w='(${xMax}-${xMin})*iw':h='(${yMax}-${yMin})*ih':color=red:t=2,`;
    filterComplex += `drawtext=text='Speaker ${frame.speakerId}':x='${xMin}*iw':y='(${yMin}-0.05)*ih':fontcolor=white:fontsize=24:box=1:boxcolor=red@0.5:boxborderw=5[v${index}];`;
  });

  if (speakingFrames.length > 0) {
    filterComplex += speakingFrames.map((_, index) => `[v${index}]`).join('');
    filterComplex += `concat=n=${speakingFrames.length}:v=1:a=0[outv]`;
  } else {
    filterComplex = '[0:v]null[outv]';
  }

  const ffmpegCommand = `ffmpeg -i "${inputVideo}" -filter_complex "${filterComplex}" -map "[outv]" -map 0:a -t ${speakingFrames.length * 0.5} "${debugOutputVideo}"`;

  return new Promise((resolve, reject) => {
    exec(ffmpegCommand, (error, stdout, stderr) => {
      if (error) {
        console.error(`Error generating debug video: ${error.message}`);
        console.error(`stderr: ${stderr}`);
        reject(error);
      } else {
        console.log(`Debug video generated successfully`);
        resolve(stdout);
      }
    });
  });
}
