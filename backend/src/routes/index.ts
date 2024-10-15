import express from 'express';
import { processAndUploadFiles } from '../services/ffmpegService';
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

export { app };
