export async function processVideo(inputVideo: string, outputVideo: string, framesDir: string) {
  try {
    const outputDir = path.dirname(outputVideo);
    fs.mkdirSync(outputDir, { recursive: true });

    const frameFiles = fs.readdirSync(framesDir).sort();
    let prevLandmarks: Array<Array<[number, number]>> = [];
    let speakingFrames: Array<{ startTime: number, speakerId: number, bbox: { topLeft: [number, number], bottomRight: [number, number] } }> = [];
    let lastMovementTime = 0;

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

      const currentTime = i / 30; // Convert frame index to seconds
      
      if (maxMovement > 0.02) { // Threshold for significant movement
        lastMovementTime = currentTime;
      }

      if (currentTime - lastMovementTime > 1) {
        // If no significant movement for more than a second, use full frame
        speakerId = -1;
        speakerBbox = { topLeft: [0, 0], bottomRight: [1, 1] };
      }

      speakingFrames.push({
        startTime: currentTime,
        speakerId: speakerId,
        bbox: speakerBbox
      });

      console.log(i, frameFiles.length);
    }

    console.log(DEBUG);
    if (DEBUG) {
      console.log("Generating debug video");
      const debugOutputVideo = path.join(outputDir, 'debug_' + path.basename(outputVideo));
      await generateDebugVideo(inputVideo, debugOutputVideo, speakingFrames);
      console.log(`Debug video saved to: ${debugOutputVideo}`);
    }

    let filterComplex = '';
    const { width, height } = await getVideoDimensions(inputVideo);

    speakingFrames.forEach((frame, index) => {
      if (frame.speakerId === -1) {
        filterComplex += `[0:v]trim=start=${frame.startTime}:duration=0.5,setpts=PTS-STARTPTS[v${index}];`;
      } else {
        const [xMin, yMin] = [frame.bbox.topLeft[0] / width, frame.bbox.topLeft[1] / height];
        const [xMax, yMax] = [frame.bbox.bottomRight[0] / width, frame.bbox.bottomRight[1] / height];
        const bboxWidth = Math.max(0.001, xMax - xMin);
        const bboxHeight = Math.max(0.001, yMax - yMin);
        const zoom = Math.min(2, Math.max(1, 1 / Math.max(bboxWidth, bboxHeight)));
        const centerX = xMin + bboxWidth / 2;
        const centerY = yMin + bboxHeight / 2;
        
        filterComplex += `[0:v]trim=start=${frame.startTime}:duration=0.5,setpts=PTS-STARTPTS,`;
        filterComplex += `crop=iw:ih:${roundToSigFigs(centerX - 0.5/zoom)}*iw/100:${roundToSigFigs(centerY - 0.5/zoom)}*ih/100,`;
        filterComplex += `scale=iw*${roundToSigFigs(zoom)}:ih*${roundToSigFigs(zoom)}[v${index}];`;
      }
    });

    filterComplex += speakingFrames.map((_, index) => `[v${index}]`).join('');
    filterComplex += `concat=n=${speakingFrames.length}:v=1:a=0[outv]`;

    const ffmpegCommand = `ffmpeg -i "${inputVideo}" -filter_complex "${filterComplex}" -map "[outv]" -map 0:a "${outputVideo}"`;

    exec(ffmpegCommand, (error, stdout, stderr) => {
      if (error) {
        console.error(`Error: ${error.message}`);
        return;
      }
      if (stderr) {
        console.error(`stderr: ${stderr}`);
      }
      console.log(`stdout: ${stdout}`);

      if (DEBUG) {
        const zoomedOutputVideo = path.join(outputDir, 'zoomed_' + path.basename(outputVideo));
        fs.copyFileSync(outputVideo, zoomedOutputVideo);
        console.log(`Zoomed video saved to: ${zoomedOutputVideo}`);
      }
    });
  } catch (error) {
    console.error("Error processing video:", error);
  }
}