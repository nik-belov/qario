import path from 'path';
import { syncDetectAndSwap } from '../services/videoProcessingService';

async function runLocalTest() {
  try {
    console.log('Starting local test...');

    // Define paths relative to project root
    const testAssetsPath = path.join(__dirname, '../../test-assets');

    const result = await syncDetectAndSwap({
      projectId: 'test-project',
      userId: 'test-user',
      leftCamera: path.join(testAssetsPath, 'videos/left camera.mov'),
      mainCamera: path.join(testAssetsPath, 'videos/main camera.mov'),
      rightCamera: path.join(testAssetsPath, 'videos/right camera.mov'),
      leftAudio: path.join(testAssetsPath, 'audio/left mic.m4a'),
      rightAudio: path.join(testAssetsPath, 'audio/right mic.m4a'),
      isLocalTesting: true, // Enable local testing mode
      processingParams: {
        speaker_bias: {
          left: 1,
          main: 1,
          right: 1,
        },
        min_clip_duration: 2,
      },
    });

    console.log('Test completed successfully!');
    console.log('Output video path:', result);
  } catch (error) {
    console.error('Test failed:', error);
  }
}

runLocalTest();
