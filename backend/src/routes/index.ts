import express from 'express';
import { processAndUploadFiles, detectSpeakerAndZoom, matchAudioVideo, analyzeVideoContent, trimVideoBasedOnContent } from '../services/ffmpegService';
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


app.post('/detect-and-zoom', async (req: any, res: any) => {
  const { videoUrl } = req.body;

  if (!videoUrl) {
    return res.status(400).json({ error: 'Missing video URL' });
  }

  try {
    const processedVideoUrl = await detectSpeakerAndZoom(videoUrl);
    return res.json({ processedVideoUrl });
  } catch (error) {
    console.error('Error processing video:', error);
    return res.status(500).json({ error: 'Failed to process video' });
  }
});

app.post('/match-audio-video', async (req: any, res: any) => {
  const { audioUrl, videoUrl } = req.body;

  if (!audioUrl || !videoUrl) {
    return res.status(400).json({ error: 'Missing audio or video URL' });
  }

  try {
    const matchedVideoUrl = await matchAudioVideo(audioUrl, videoUrl);
    return res.json({ matchedVideoUrl });
  } catch (error) {
    console.error('Error matching audio and video:', error);
    return res.status(500).json({ error: 'Failed to match audio and video' });
  }
});

// New endpoint for video content analysis
app.post('/analyze-video', async (req: any, res: any) => {
  const { videoUrl } = req.body;

  if (!videoUrl) {
    return res.status(400).json({ error: 'Missing video URL' });
  }

  try {
    const analysisResult = await analyzeVideoContent(videoUrl);
    return res.json(analysisResult);
  } catch (error) {
    console.error('Error analyzing video content:', error);
    return res.status(500).json({ error: 'Failed to analyze video content' });
  }
});

app.post('/trim-video', async (req: any, res: any) => {
  const { videoUrl, transcript, frameDescriptions, prompt } = req.body;

  if (!videoUrl || !transcript || !frameDescriptions || !prompt) {
    return res.status(400).json({ error: 'Missing required data' });
  }

  try {
    const result = await trimVideoBasedOnContent(videoUrl, transcript, frameDescriptions, prompt);
    return res.json(result);
  } catch (error) {
    console.error('Error trimming video:', error);
    return res.status(500).json({ error: 'Failed to trim video based on content' });
  }
});

export { app };
