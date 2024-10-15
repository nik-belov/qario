import express from 'express';
import { processAndUploadFiles, cutVideo, trimVideo } from '../services/ffmpegService';
import { config } from 'dotenv';

config();

const app = express();
app.use(express.json());

app.post('/process', async (req: any, res: any) => {
  const {
    projectId,
    userId,
    leftCamera,
    mainCamera,
    rightCamera,
    leftAudio,
    rightAudio,
  } = req.body;

  if (
    !projectId ||
    !userId ||
    !leftCamera ||
    !mainCamera ||
    !rightCamera ||
    !leftAudio ||
    !rightAudio
  ) {
    return res.status(400).json({ error: 'Missing required data' });
  }

  try {
    const finalVideoUrl = await processAndUploadFiles({
      projectId,
      userId,
      leftCamera,
      mainCamera,
      rightCamera,
      leftAudio,
      rightAudio,
    });

    return res.json({ finalVideoUrl });
  } catch (error) {
    console.error('Error processing files:', error);
    return res
      .status(500)
      .json({ error: 'Failed to process and upload files' });
  }
});

app.post('/cut', async (req: any, res: any) => {
  const { projectId, leftCamera, mainCamera, rightCamera } = req.body;

  if (!projectId || !leftCamera || !mainCamera || !rightCamera) {
    return res.status(400).json({ error: 'Missing required data' });
  }

  try {
    const result = await cutVideo(projectId, leftCamera, mainCamera, rightCamera);
    return res.json(result);
  } catch (error) {
    console.error('Error cutting videos:', error);
    return res.status(500).json({ error: 'Failed to cut videos' });
  }
});

app.post('/trim', async (req: any, res: any) => {
  const { projectId, leftCamera, mainCamera, rightCamera, startTime, endTime } = req.body;

  if (!projectId || !leftCamera || !mainCamera || !rightCamera || startTime === undefined || endTime === undefined) {
    return res.status(400).json({ error: 'Missing required data' });
  }

  try {
    const result = await trimVideo(projectId, leftCamera, mainCamera, rightCamera, startTime, endTime);
    return res.json(result);
  } catch (error) {
    console.error('Error trimming videos:', error);
    return res.status(500).json({ error: 'Failed to trim videos' });
  }
});

export { app };
