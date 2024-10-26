import sys
import cv2
import numpy as np
from scipy.signal import correlate
from moviepy.editor import VideoFileClip, AudioFileClip, concatenate_videoclips
import os  # Make sure to import os for file existence checks
from speaker_detection_zoom import detect_faces_fast, bbox_iou

def sync_audio_with_video(video_path, audio_path):
    """
    Synchronize audio with video using audio waveform analysis
    """
    try:
        video = VideoFileClip(video_path)
        audio = AudioFileClip(audio_path)
        
        # Extract audio from video and convert to arrays
        video_audio = video.audio
        
        # Convert audio to numpy arrays correctly
        def audio_to_array(audio_clip):
            if audio_clip is None:
                return np.array([])
            chunks = list(audio_clip.iter_chunks(chunksize=1024))
            if not chunks:
                return np.array([])
            return np.concatenate(chunks)

        video_audio_array = audio_to_array(video_audio)
        audio_array = audio_to_array(audio)
        
        # Find sync point using audio amplitude peaks
        video_peaks = find_audio_peaks(video_audio_array)
        audio_peaks = find_audio_peaks(audio_array)
        
        if len(video_peaks) > 0 and len(audio_peaks) > 0:
            # Calculate delay based on first significant peak
            delay = (audio_peaks[0] - video_peaks[0]) / (video_audio.fps or audio.fps or 44100)
            synced_video = video.set_audio(audio.set_start(delay))
        else:
            # If no clear peaks, return original video with new audio
            synced_video = video.set_audio(audio)
        
        return synced_video
        
    except Exception as e:
        print(f"Error in sync_audio_with_video: {str(e)}")
        # Fallback: return video with original audio
        return video.set_audio(audio)

def sync_cameras(left_video, main_video, right_video):
    """
    Synchronize cameras using audio analysis and timestamps
    """
    # Get audio from each video
    left_audio = left_video.audio
    main_audio = main_video.audio
    right_audio = right_video.audio
    
    # Convert to arrays
    def audio_to_array(audio):
        if audio is None:
            return np.array([])
        chunks = list(audio.iter_chunks(chunksize=1024))
        if not chunks:
            return np.array([])
        return np.concatenate(chunks)

    left_array = audio_to_array(left_audio)
    main_array = audio_to_array(main_audio)
    right_array = audio_to_array(right_audio)
    
    # Find sync points
    left_delay = find_sync_offset(left_array, main_array)
    right_delay = find_sync_offset(right_array, main_array)
    
    # Adjust videos based on computed delays
    left_synced = left_video.subclip(left_delay if left_delay > 0 else 0)
    main_synced = main_video.subclip(abs(left_delay) if left_delay < 0 else 0)
    right_synced = right_video.subclip(right_delay if right_delay > 0 else 0)
    
    # Trim to same length
    min_duration = min(left_synced.duration, main_synced.duration, right_synced.duration)
    left_synced = left_synced.subclip(0, min_duration)
    main_synced = main_synced.subclip(0, min_duration)
    right_synced = right_synced.subclip(0, min_duration)
    
    return left_synced, main_synced, right_synced

def detect_speaker(frame):
    face_locations = detect_faces_fast(frame)
    return len(face_locations) > 0

def process_videos(left_camera, main_camera, right_camera, left_audio, right_audio, output_path):
    try:
        print("Starting video processing...")
        
        # Sync audio with videos
        print("Syncing left camera...")
        left_synced = sync_audio_with_video(left_camera, left_audio)
        print("Syncing main camera...")
        main_synced = sync_audio_with_video(main_camera, left_audio)
        print("Syncing right camera...")
        right_synced = sync_audio_with_video(right_camera, right_audio)

        # Sync cameras
        print("Syncing all cameras together...")
        left_synced, main_synced, right_synced = sync_cameras(left_synced, main_synced, right_synced)

        # Ensure all videos have the same duration and fps
        min_duration = min(left_synced.duration, main_synced.duration, right_synced.duration)
        target_fps = min(left_synced.fps, main_synced.fps, right_synced.fps)
        print(f"Minimum duration: {min_duration}, Target FPS: {target_fps}")
        
        # Adjust duration to be a multiple of 1/target_fps
        min_duration = int(min_duration * target_fps) / target_fps
        
        left_synced = left_synced.subclip(0, min_duration).set_fps(target_fps)
        main_synced = main_synced.subclip(0, min_duration).set_fps(target_fps)
        right_synced = right_synced.subclip(0, min_duration).set_fps(target_fps)

        print(f"Adjusted duration: {min_duration}")
        print(f"Left synced - Duration: {left_synced.duration}, FPS: {left_synced.fps}")
        print(f"Main synced - Duration: {main_synced.duration}, FPS: {main_synced.fps}")
        print(f"Right synced - Duration: {right_synced.duration}, FPS: {right_synced.fps}")

        # Process frames and swap based on speaker detection
        clips = []
        current_speaker = 1  # Start with main camera
        segment_start = 0

        print(f"Processing frames for {min_duration} seconds...")
        for t in np.arange(0, min_duration, 1/target_fps):
            # Ensure we don't go beyond the clip duration
            if t >= min_duration - 1/target_fps:
                break

            try:
                left_frame = left_synced.get_frame(t)
                main_frame = main_synced.get_frame(t)
                right_frame = right_synced.get_frame(t)
            except Exception as e:
                print(f"Error getting frame at time {t}: {str(e)}")
                break

            left_speaking = detect_speaker(left_frame)
            right_speaking = detect_speaker(right_frame)

            new_speaker = 1  # default to main
            if left_speaking and not right_speaking:
                new_speaker = 0
            elif right_speaking and not left_speaking:
                new_speaker = 2
            
            # Only create a new clip when speaker changes
            if new_speaker != current_speaker:
                # Add the clip up to this point
                clip_end = t
                try:
                    if current_speaker == 0:
                        clips.append(left_synced.subclip(segment_start, clip_end))
                    elif current_speaker == 2:
                        clips.append(right_synced.subclip(segment_start, clip_end))
                    else:
                        clips.append(main_synced.subclip(segment_start, clip_end))
                except Exception as e:
                    print(f"Error creating subclip from {segment_start} to {clip_end}: {str(e)}")
                    break
                
                segment_start = clip_end
                current_speaker = new_speaker

        # Add the final clip
        try:
            if current_speaker == 0:
                clips.append(left_synced.subclip(segment_start, min_duration))
            elif current_speaker == 2:
                clips.append(right_synced.subclip(segment_start, min_duration))
            else:
                clips.append(main_synced.subclip(segment_start, min_duration))
        except Exception as e:
            print(f"Error adding final clip: {str(e)}")

        print(f"Number of clips generated: {len(clips)}")

        if not clips:
            print("No clips were generated. Using main video as fallback.")
            final_video = main_synced
        else:
            print("Concatenating clips...")
            final_video = concatenate_videoclips(clips)

        print(f"Writing final video to {output_path}...")
        final_video.write_videofile(output_path, fps=target_fps)
        print("Video processing completed successfully.")
        
    except Exception as e:
        print(f"Error in process_videos: {str(e)}")
        raise

def find_audio_peaks(audio_array):
    """
    Find significant peaks in audio signal
    """
    # Convert stereo to mono if necessary
    if len(audio_array.shape) > 1:
        audio_mono = np.mean(audio_array, axis=1)
    else:
        audio_mono = audio_array
    
    # Calculate amplitude envelope
    window_size = 1024
    amplitude_envelope = np.array([max(audio_mono[i:i+window_size]) 
                                 for i in range(0, len(audio_mono), window_size)])
    
    # Find peaks above threshold
    threshold = np.mean(amplitude_envelope) + 2 * np.std(amplitude_envelope)
    peaks = np.where(amplitude_envelope > threshold)[0]
    
    return peaks * window_size

def find_sync_offset(audio1, audio2):
    """
    Find timing offset between two audio streams
    """
    # Convert to mono if stereo
    if len(audio1.shape) > 1:
        audio1 = np.mean(audio1, axis=1)
    if len(audio2.shape) > 1:
        audio2 = np.mean(audio2, axis=1)
    
    # Compute cross-correlation
    correlation = correlate(audio1, audio2, mode='full')
    max_idx = np.argmax(correlation)
    
    # Convert samples to seconds
    offset = (max_idx - len(audio1)) / 44100  # assuming 44.1kHz sample rate
    
    return offset

if __name__ == "__main__":
    if len(sys.argv) != 8:
        print("Usage: script.py left_camera main_camera right_camera left_audio right_audio output_path project_id")
        sys.exit(1)
        
    # print durations of each file
    print(f"Left camera duration: {VideoFileClip(sys.argv[1]).duration}")
    print(f"Main camera duration: {VideoFileClip(sys.argv[2]).duration}")
    print(f"Right camera duration: {VideoFileClip(sys.argv[3]).duration}")
    print(f"Left audio duration: {AudioFileClip(sys.argv[4]).duration}")
    print(f"Right audio duration: {AudioFileClip(sys.argv[5]).duration}")
    
    # Validate input files exist
    input_files = sys.argv[1:6]
    for file_path in input_files:
        if not os.path.exists(file_path):
            print(f"Error: File not found: {file_path}")
            sys.exit(1)
            
    left_camera, main_camera, right_camera, left_audio, right_audio, output_path, project_id = sys.argv[1:]
    process_videos(left_camera, main_camera, right_camera, left_audio, right_audio, output_path)
    print(f"Processing completed. Output saved to {output_path}")
