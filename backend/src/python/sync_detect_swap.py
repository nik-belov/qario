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
        
        # Find sync point using cross-correlation
        delay = find_sync_offset(video_audio_array, audio_array)
        
        # Apply the delay to the audio
        synced_audio = audio.subclip(max(0, -delay))
        if delay > 0:
            synced_audio = AudioFileClip(audio_path).set_start(delay)
        
        synced_video = video.set_audio(synced_audio)
        
        return synced_video
        
    except Exception as e:
        print(f"Error in sync_audio_with_video: {str(e)}")
        # Fallback: return video with original audio
        return video.set_audio(audio)

def sync_cameras(left_video, main_video, right_video):
    """
    Synchronize cameras while preserving original video-audio sync
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
    
    # Determine the global start time
    global_start = max(0, -left_delay, -right_delay)
    
    # Adjust videos based on computed delays
    left_start = max(0, global_start + left_delay)
    main_start = max(0, global_start)
    right_start = max(0, global_start + right_delay)
    
    left_synced = left_video.subclip(left_start)
    main_synced = main_video.subclip(main_start)
    right_synced = right_video.subclip(right_start)
    
    # Get minimum duration considering both video and audio
    min_duration = min(
        left_synced.duration, main_synced.duration, right_synced.duration,
        left_synced.audio.duration if left_synced.audio else float('inf'),
        main_synced.audio.duration if main_synced.audio else float('inf'),
        right_synced.audio.duration if right_synced.audio else float('inf')
    )
    
    # Trim to same length
    left_synced = left_synced.subclip(0, min_duration)
    main_synced = main_synced.subclip(0, min_duration)
    right_synced = right_synced.subclip(0, min_duration)
    
    # Debug logging
    print(f"Left sync delay: {left_delay}")
    print(f"Right sync delay: {right_delay}")
    print(f"Global start time: {global_start}")
    print(f"Start times - Left: {left_start}, Main: {main_start}, Right: {right_start}")
    print(f"Synced durations - Left: {left_synced.duration}, Main: {main_synced.duration}, Right: {right_synced.duration}")
    print(f"Synced audio durations - Left: {left_synced.audio.duration}, Main: {main_synced.audio.duration}, Right: {right_synced.audio.duration}")
    
    return left_synced, main_synced, right_synced

def detect_mouth_movement(frame):
    face_locations = detect_faces_fast(frame)
    
    if not face_locations:
        return 0
    
    # Get the largest face (assuming the speaker is likely the largest face in the frame)
    largest_face = max(face_locations, key=lambda face: (face[2] - face[0]) * (face[1] - face[3]))
    
    # Extract mouth region (approximate)
    top, right, bottom, left = largest_face
    mouth_top = top + int((bottom - top) * 0.65)
    mouth_bottom = bottom
    mouth_left = left + int((right - left) * 0.25)
    mouth_right = right - int((right - left) * 0.25)
    
    mouth_region = frame[mouth_top:mouth_bottom, mouth_left:mouth_right]
    
    # Convert to grayscale
    gray_mouth = cv2.cvtColor(mouth_region, cv2.COLOR_RGB2GRAY)
    
    # Calculate the variance of the mouth region
    # Higher variance indicates more movement
    mouth_variance = np.var(gray_mouth)
    
    return mouth_variance

def process_videos(left_camera, main_camera, right_camera, left_audio, right_audio, output_path, speaker_bias={'left': 1.2, 'main': 1.0, 'right': 1.0}):
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

        # Get minimum duration considering both video and audio for each clip
        left_duration = min(left_synced.duration, left_synced.audio.duration if left_synced.audio else float('inf'))
        main_duration = min(main_synced.duration, main_synced.audio.duration if main_synced.audio else float('inf'))
        right_duration = min(right_synced.duration, right_synced.audio.duration if right_synced.audio else float('inf'))

        # Use the shortest duration among all clips
        min_duration = min(left_duration, main_duration, right_duration)

        # Trim videos to the shortest duration that has both audio and video
        left_synced = left_synced.subclip(0, min_duration)
        main_synced = main_synced.subclip(0, min_duration)
        right_synced = right_synced.subclip(0, min_duration)

        print(f"Adjusted duration: {min_duration}")
        print(f"Left synced - Duration: {left_synced.duration}, FPS: {left_synced.fps}")
        print(f"Main synced - Duration: {main_synced.duration}, FPS: {main_synced.fps}")
        print(f"Right synced - Duration: {right_synced.duration}, FPS: {right_synced.fps}")

        # Process frames and swap based on speaker detection
        clips = []
        current_speaker = 1  # Start with main camera
        segment_start = 0
        min_clip_duration = 1.0  # Minimum clip duration in seconds

        print(f"Processing frames for {min_duration} seconds...")
        for t in np.arange(0, min_duration, 1/main_synced.fps):
            # Ensure we don't go beyond the clip duration
            if t >= min_duration - 1/main_synced.fps:
                break

            try:
                left_frame = left_synced.get_frame(t)
                main_frame = main_synced.get_frame(t)
                right_frame = right_synced.get_frame(t)
            except Exception as e:
                print(f"Error getting frame at time {t}: {str(e)}")
                break

            left_movement = detect_mouth_movement(left_frame) * speaker_bias['left']
            main_movement = detect_mouth_movement(main_frame) * speaker_bias['main']
            right_movement = detect_mouth_movement(right_frame) * speaker_bias['right']

            new_speaker = 1  # default to main
            if left_movement > right_movement and left_movement > main_movement:
                new_speaker = 0
            elif right_movement > left_movement and right_movement > main_movement:
                new_speaker = 2
            
            # Only create a new clip when speaker changes and the previous clip is long enough
            if new_speaker != current_speaker and (t - segment_start) >= min_clip_duration:
                # Add the clip up to this point
                clip_end = t
                try:
                    if current_speaker == 0:
                        clip = left_synced.subclip(segment_start, clip_end)
                    elif current_speaker == 2:
                        clip = right_synced.subclip(segment_start, clip_end)
                    else:
                        clip = main_synced.subclip(segment_start, clip_end)
                    
                    # Ensure audio is included in the clip
                    if clip.audio is None:
                        print(f"Warning: No audio in clip from {segment_start} to {clip_end}")
                    
                    # Resize clip to match main_synced's aspect ratio
                    clip = resize_clip(clip, main_synced.w, main_synced.h)
                    
                    clips.append(clip.set_fps(main_synced.fps))
                except Exception as e:
                    print(f"Error creating subclip from {segment_start} to {clip_end}: {str(e)}")
                    break
                
                segment_start = clip_end
                current_speaker = new_speaker

        # Add the final clip
        try:
            if current_speaker == 0:
                clip = left_synced.subclip(segment_start, min_duration)
            elif current_speaker == 2:
                clip = right_synced.subclip(segment_start, min_duration)
            else:
                clip = main_synced.subclip(segment_start, min_duration)
            
            # Ensure audio is included in the final clip
            if clip.audio is None:
                print(f"Warning: No audio in final clip from {segment_start} to {min_duration}")
            
            # Resize final clip to match main_synced's aspect ratio
            clip = resize_clip(clip, main_synced.w, main_synced.h)
            
            clips.append(clip.set_fps(main_synced.fps))
        except Exception as e:
            print(f"Error adding final clip: {str(e)}")

        print(f"Number of clips generated: {len(clips)}")

        if not clips:
            print("No clips were generated. Using main video as fallback.")
            final_video = main_synced
        else:
            print("Concatenating clips...")
            print(clips)
            final_video = concatenate_videoclips(clips, method="compose")

        # Ensure the final video has audio
        if final_video.audio is None:
            print("Warning: Final video has no audio. Attempting to add audio from main video.")
            final_video = final_video.set_audio(main_synced.audio)

        print(f"Writing final video to {output_path}...")
        final_video.write_videofile(output_path, fps=main_synced.fps, audio_codec='aac', audio=True)
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
    Find timing offset between two audio streams using cross-correlation
    """
    # Convert to mono if stereo
    if len(audio1.shape) > 1:
        audio1 = np.mean(audio1, axis=1)
    if len(audio2.shape) > 1:
        audio2 = np.mean(audio2, axis=1)
    
    # Normalize audio signals
    audio1 = (audio1 - np.mean(audio1)) / (np.std(audio1) + 1e-8)
    audio2 = (audio2 - np.mean(audio2)) / (np.std(audio2) + 1e-8)
    
    # Compute cross-correlation
    correlation = correlate(audio1, audio2, mode='full', method='fft')
    max_idx = np.argmax(np.abs(correlation))
    
    # Convert samples to seconds
    offset = (max_idx - len(audio1)) / 44100  # assuming 44.1kHz sample rate
    
    return offset

def resize_clip(clip, target_width, target_height):
    """
    Resize a clip to match the target width and height while maintaining aspect ratio.
    """
    aspect_ratio = clip.w / clip.h
    target_ratio = target_width / target_height

    if aspect_ratio > target_ratio:
        # Clip is wider, crop the sides
        new_width = int(clip.h * target_ratio)
        crop_amount = (clip.w - new_width) // 2
        resized_clip = clip.crop(x1=crop_amount, x2=clip.w-crop_amount)
    elif aspect_ratio < target_ratio:
        # Clip is taller, crop the top and bottom
        new_height = int(clip.w / target_ratio)
        crop_amount = (clip.h - new_height) // 2
        resized_clip = clip.crop(y1=crop_amount, y2=clip.h-crop_amount)
    else:
        # Aspect ratios match, no cropping needed
        resized_clip = clip

    return resized_clip.resize((target_width, target_height)).set_audio(clip.audio)

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
    
    # Default bias towards showing the left speaker more frequently
    # NOTE: Should probably make this a parameters to the endpoint.
    speaker_bias = {'left': 1.2, 'main': 1.0, 'right': 1.0}
    
    process_videos(left_camera, main_camera, right_camera, left_audio, right_audio, output_path, speaker_bias)
    print(f"Processing completed. Output saved to {output_path}")
