import React, { useState, useRef, useEffect } from 'react';
import { Slider } from '@/components/ui/slider';

interface VideoTimelineProps {
  videoRef: React.RefObject<HTMLVideoElement>;
}

const VideoTimeline: React.FC<VideoTimelineProps> = ({ videoRef }) => {
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
      videoRef.current.addEventListener('timeupdate', handleTimeUpdate);
      videoRef.current.addEventListener('loadedmetadata', handleLoadedMetadata);
    }
    return () => {
      if (videoRef.current) {
        videoRef.current.removeEventListener('timeupdate', handleTimeUpdate);
        videoRef.current.removeEventListener('loadedmetadata', handleLoadedMetadata);
      }
    };
  }, [videoRef]);

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
    }
  };

  const handleSliderChange = (newValue: number[]) => {
    if (videoRef.current) {
      videoRef.current.currentTime = newValue[0];
      setCurrentTime(newValue[0]);
      updateFramePreview(newValue[0]);
    }
  };

  const updateFramePreview = (time: number) => {
    if (videoRef.current && canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) {
        videoRef.current.currentTime = time;
        ctx.drawImage(videoRef.current, 0, 0, canvasRef.current.width, canvasRef.current.height);
      }
    }
  };

  const togglePlayPause = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  return (
    <div className="mt-4">
      <div className="flex items-center mb-2">
        <button onClick={togglePlayPause} className="mr-2">
          {isPlaying ? 'Pause' : 'Play'}
        </button>
        <span>{formatTime(currentTime)} / {formatTime(duration)}</span>
      </div>
      <Slider
        value={[currentTime]}
        max={duration}
        step={0.1}
        onValueChange={handleSliderChange}
      />
      <canvas ref={canvasRef} width="160" height="90" className="mt-2" />
    </div>
  );
};

const formatTime = (time: number): string => {
  const minutes = Math.floor(time / 60);
  const seconds = Math.floor(time % 60);
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
};

export default VideoTimeline;