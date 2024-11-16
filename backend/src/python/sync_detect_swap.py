import sys
import cv2
import numpy as np
from scipy.signal import correlate, butter, filtfilt, medfilt
from moviepy.editor import VideoFileClip, AudioFileClip, concatenate_videoclips
from moviepy.audio.AudioClip import AudioArrayClip
import os
from speaker_detection_zoom import detect_faces_fast

import sync_video_audio


# Convert audio to numpy arrays correctly
def audio_to_array(audio_clip):
    if audio_clip is None:
        return np.array([])
    chunks = list(audio_clip.iter_chunks(chunksize=1024))
    if not chunks:
        return np.array([])
    return np.concatenate(chunks)

def sync_audio_with_video(video_path, audio_path):
    """
    Synchronize audio with video using audio waveform analysis
    """
    try:
        return sync_video_audio.sync(video_path, audio_path)
        
    except Exception as e:
        print(f"Error in sync_audio_with_video: {str(e)}")
        # Fallback: return video with original audio
        video_clip = VideoFileClip(video_path)
        audio_clip = AudioFileClip(audio_path)
        return video_clip.set_audio(audio_clip)

def sync_cameras(left_video, right_video):
    """
    Synchronize cameras while preserving original video-audio sync
    """
    # Get audio from each video
    left_audio = left_video.audio
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
    right_array = audio_to_array(right_audio)
    
    # Find sync points
    delay = find_sync_offset(left_array, right_array)
    
    # Determine the global start time
    global_start = max(0, -delay)
    
    # Adjust videos based on computed delays
    left_start = max(0, global_start)
    right_start = max(0, global_start + delay)
    
    left_synced = left_video.subclip(left_start)
    right_synced = right_video.subclip(right_start)
    
    # Get minimum duration considering both video and audio
    min_duration = min(
        left_synced.duration, right_synced.duration,
        left_synced.audio.duration if left_synced.audio else float('inf'),
        right_synced.audio.duration if right_synced.audio else float('inf')
    )
    
    # Trim to same length
    left_synced = left_synced.subclip(0, min_duration)
    right_synced = right_synced.subclip(0, min_duration)
    
    # Debug logging
    print(f"Sync delay: {delay}")
    print(f"Global start time: {global_start}")
    print(f"Start times - Left: {left_start}, Right: {right_start}")
    print(f"Synced durations - Left: {left_synced.duration}, Right: {right_synced.duration}")
    print(f"Synced audio durations - Left: {left_synced.audio.duration}, Right: {right_synced.audio.duration}")
    
    return left_synced, right_synced

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

def enhance_mixed_audio(audio_array, sample_rate, 
                       noise_reduction=0.1, 
                       low_cut=100, 
                       high_cut=7000, 
                       compression_threshold=0.5, 
                       compression_ratio=0.7):
    """
    Apply gentle enhancement to the mixed audio
    """
    # Apply subtle noise reduction
    noise_reduced = audio_array * (1 - noise_reduction) + medfilt(audio_array, kernel_size=3) * noise_reduction
    
    # Apply bandpass filter to focus on speech frequencies
    nyquist = sample_rate / 2
    low_cutoff = low_cut / nyquist
    high_cutoff = high_cut / nyquist
    b, a = butter(2, [low_cutoff, high_cutoff], btype='band')
    filtered = filtfilt(b, a, noise_reduced)
    
    # Gentle dynamic range compression
    above_threshold = filtered > compression_threshold
    filtered[above_threshold] = compression_threshold + (filtered[above_threshold] - compression_threshold) * compression_ratio
    
    # Normalize
    filtered = filtered / np.max(np.abs(filtered))
    
    return filtered

def smart_audio_merge(audio1, audio2, sample_rate=44100,
                     noise_reduction=0.05,
                     low_cut=80,
                     high_cut=8000,
                     compression_threshold=0.7,
                     compression_ratio=0.8):
    """
    Intelligently merge two audio streams using advanced processing techniques
    """
    def audio_to_array(audio_clip):
        if audio_clip is None:
            return np.array([])
        chunks = list(audio_clip.iter_chunks(chunksize=1024))
        if not chunks:
            return np.array([])
        return np.concatenate(chunks)

    array1 = audio_to_array(audio1)
    array2 = audio_to_array(audio2)

    # Ensure same length
    max_length = max(len(array1), len(array2))
    array1 = np.pad(array1, ((0, max_length - len(array1)), (0, 0)) if len(array1.shape) > 1 else (0, max_length - len(array1)))
    array2 = np.pad(array2, ((0, max_length - len(array2)), (0, 0)) if len(array2.shape) > 1 else (0, max_length - len(array2)))

    # Convert to mono if stereo
    if len(array1.shape) > 1:
        array1 = np.mean(array1, axis=1)
    if len(array2.shape) > 1:
        array2 = np.mean(array2, axis=1)

    # Process in windows
    window_size = 1024
    hop_length = 512
    merged = np.zeros_like(array1)

    for i in range(0, len(array1) - window_size, hop_length):
        window1 = array1[i:i+window_size]
        window2 = array2[i:i+window_size]

        # Calculate SNR for each window
        noise_floor1 = np.mean(np.sort(np.abs(window1))[:window_size//10])
        noise_floor2 = np.mean(np.sort(np.abs(window2))[:window_size//10])
        snr1 = np.mean(np.abs(window1)) / (noise_floor1 + 1e-10)
        snr2 = np.mean(np.abs(window2)) / (noise_floor2 + 1e-10)

        # Calculate spectral content
        spec1 = np.abs(np.fft.rfft(window1))
        spec2 = np.abs(np.fft.rfft(window2))
        
        # Calculate spectral flatness (measure of how noise-like the signal is)
        flatness1 = np.exp(np.mean(np.log(spec1 + 1e-10))) / (np.mean(spec1) + 1e-10)
        flatness2 = np.exp(np.mean(np.log(spec2 + 1e-10))) / (np.mean(spec2) + 1e-10)

        # Calculate dynamic weights based on multiple factors
        weight1 = snr1 * (1 - flatness1)
        weight2 = snr2 * (1 - flatness2)
        
        # Normalize weights
        total_weight = weight1 + weight2
        if total_weight > 0:
            weight1 /= total_weight
            weight2 /= total_weight
        else:
            weight1 = weight2 = 0.5

        # Apply spectral masking
        freq_mask = np.where(spec1 > spec2, weight1, weight2)
        merged_spec = spec1 * freq_mask + spec2 * (1 - freq_mask)
        
        # Reconstruct time domain signal
        merged_window = np.fft.irfft(merged_spec * np.exp(1j * np.angle(np.fft.rfft(window1))))
        
        # Overlap-add
        merged[i:i+window_size] += merged_window * np.hanning(window_size)

    # Normalize output
    merged = merged / np.max(np.abs(merged))

    # Apply enhancement with provided settings
    merged = enhance_mixed_audio(merged, sample_rate,
                               noise_reduction=noise_reduction,
                               low_cut=low_cut,
                               high_cut=high_cut,
                               compression_threshold=compression_threshold,
                               compression_ratio=compression_ratio)

    # Convert to stereo
    merged_stereo = np.column_stack((merged, merged))

    return AudioArrayClip(merged_stereo, fps=sample_rate)

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

def analyze_audio_characteristics(audio_array, sample_rate=44100):
    """
    Analyze audio quality using established signal processing metrics
    """
    if len(audio_array.shape) > 1:
        audio_array = np.mean(audio_array, axis=1)
    
    # 1. PESQ-inspired metrics (Perceptual Evaluation of Speech Quality)
    # Calculate frequency-weighted SNR in critical bands
    spectrum = np.abs(np.fft.rfft(audio_array))
    freqs = np.fft.rfftfreq(len(audio_array), d=1/sample_rate)
    
    # Define critical bands (simplified version of Bark scale)
    critical_bands = [
        (20, 300),    # First formant region
        (300, 1000),  # Second formant region
        (1000, 3000), # Third formant region
        (3000, 7000)  # Consonant region
    ]
    
    band_weights = [0.2, 0.3, 0.3, 0.2]  # Based on speech intelligibility research
    weighted_snr = 0
    
    for (low, high), weight in zip(critical_bands, band_weights):
        band_mask = (freqs >= low) & (freqs <= high)
        if np.any(band_mask):
            band_spectrum = spectrum[band_mask]
            band_snr = 10 * np.log10(
                np.mean(band_spectrum**2) / 
                (np.percentile(band_spectrum, 10)**2 + 1e-10)
            )
            weighted_snr += weight * min(band_snr / 30, 1)  # Cap at 30dB
    
    # 2. Speech Clarity Metrics
    # Calculate modulation spectrum (4-16Hz range important for speech)
    frame_size = int(0.032 * sample_rate)  # 32ms frames
    hop_length = frame_size // 2
    
    frames = np.array([
        np.sqrt(np.mean(frame**2))
        for frame in np.array_split(audio_array, len(audio_array) // hop_length)
    ])
    
    mod_spectrum = np.abs(np.fft.rfft(frames))
    mod_freqs = np.fft.rfftfreq(len(frames), d=hop_length/sample_rate)
    
    speech_mod_mask = (mod_freqs >= 4) & (mod_freqs <= 16)
    speech_mod_energy = np.mean(mod_spectrum[speech_mod_mask])
    total_mod_energy = np.mean(mod_spectrum) + 1e-10
    
    # Speech modulation ratio (higher = clearer speech)
    modulation_ratio = speech_mod_energy / total_mod_energy
    
    # 3. Calculate C50 (Speech Clarity Index - simplified)
    # Ratio of early (< 50ms) to late energy
    early_samples = int(0.05 * sample_rate)
    early_energy = np.sum(audio_array[:early_samples]**2)
    late_energy = np.sum(audio_array[early_samples:]**2) + 1e-10
    c50 = 10 * np.log10(early_energy / late_energy)
    
    # Normalize C50 to 0-1 range (typical C50 values range from -5 to 15 dB)
    c50_normalized = (c50 + 5) / 20
    
    # Combine metrics using research-based weights
    clarity_score = (
        0.4 * weighted_snr +          # Speech-weighted SNR
        0.4 * modulation_ratio +      # Speech modulation
        0.2 * min(max(c50_normalized, 0), 1)  # Early-to-late ratio
    )
    
    # Calculate compression parameters based on clarity metrics
    compression_threshold = 0.35 + (clarity_score * 0.4)  # Range: 0.35-0.75
    compression_ratio = 0.6 + (clarity_score * 0.3)       # Range: 0.6-0.9
    
    return {
        'compression_threshold': compression_threshold,
        'compression_ratio': compression_ratio,
        'clarity_score': clarity_score,
        'weighted_snr': weighted_snr,
        'modulation_ratio': modulation_ratio,
        'c50': c50
    }

def process_videos(left_camera, right_camera, left_audio, right_audio, output_path, 
                  speaker_bias={'left': 1.0, 'main': 1.0, 'right': 1.0},
                  min_clip_duration=1.0,
                  audio_params=None,
                  merge_audio=True):
    """
    Process videos with configurable parameters
    audio_params: dict with keys for audio processing settings
    merge_audio: bool, whether to merge audio or use individual audio tracks
    """
    try:
        print("Starting video processing...")
        
        # Sync audio with videos
        print("Syncing left camera...")
        left_synced = sync_audio_with_video(left_camera, left_audio)
        print("Syncing right camera...")
        right_synced = sync_audio_with_video(right_camera, right_audio)

        # Sync cameras
        print("Syncing all cameras together...")
        left_synced, right_synced = sync_cameras(left_synced, right_synced)

        if merge_audio:
            print("Analyzing audio characteristics...")
            # Convert audio to arrays for analysis
            left_array = audio_to_array(left_synced.audio)
            right_array = audio_to_array(right_synced.audio)
            
            # Analyze both audio tracks
            left_analysis = analyze_audio_characteristics(left_array)
            right_analysis = analyze_audio_characteristics(right_array)
            
            # Use the more conservative compression settings
            optimal_compression = {
                'compression_threshold': max(left_analysis['compression_threshold'], 
                                          right_analysis['compression_threshold']),
                'compression_ratio': max(left_analysis['compression_ratio'], 
                                       right_analysis['compression_ratio'])
            }
            
            print(f"Optimal compression parameters determined: {optimal_compression}")
            
            # Update audio_params with analyzed compression settings
            if audio_params is None:
                audio_params = {}
            audio_params.update(optimal_compression)
            
            # Use smart audio merging with provided parameters
            print("Merging audio tracks...")
            merged_audio = smart_audio_merge(
                left_synced.audio, 
                right_synced.audio,
                **audio_params
            )
            
            # Apply merged audio to all clips
            left_synced = left_synced.set_audio(merged_audio)
            right_synced = right_synced.set_audio(merged_audio)
        else:
            print("Using individual audio tracks...")
            # Keep original audio for each video
            pass

        # Get minimum duration considering both video and audio for each clip
        left_duration = min(left_synced.duration, left_synced.audio.duration if left_synced.audio else float('inf'))
        right_duration = min(right_synced.duration, right_synced.audio.duration if right_synced.audio else float('inf'))

        # Use the shortest duration among all clips
        min_duration = min(left_duration, right_duration)

        # Trim videos to the shortest duration that has both audio and video
        left_synced = left_synced.subclip(0, min_duration)
        right_synced = right_synced.subclip(0, min_duration)

        print(f"Adjusted duration: {min_duration}")
        print(f"Left synced - Duration: {left_synced.duration}, FPS: {left_synced.fps}")
        print(f"Right synced - Duration: {right_synced.duration}, FPS: {right_synced.fps}")

        # Process frames and swap based on speaker detection
        clips = []
        current_speaker = 1  # Start with main camera
        segment_start = 0
        min_clip_duration = min_clip_duration  # Minimum clip duration in seconds

        print(f"Processing frames for {min_duration} seconds...")
        for t in np.arange(0, min_duration, 1/left_synced.fps):
            # Ensure we don't go beyond the clip duration
            if t >= min_duration - 1/left_synced.fps:
                break

            try:
                left_frame = left_synced.get_frame(t)
                right_frame = right_synced.get_frame(t)
            except Exception as e:
                print(f"Error getting frame at time {t}: {str(e)}")
                break

            left_movement = detect_mouth_movement(left_frame) * speaker_bias['left']
            right_movement = detect_mouth_movement(right_frame) * speaker_bias['right']

            new_speaker = 0  # default to left
            if left_movement > right_movement:
                new_speaker = 0
            elif right_movement > left_movement:
                new_speaker = 2
            
            # Only create a new clip when speaker changes and the previous clip is long enough
            if new_speaker != current_speaker and (t - segment_start) >= min_clip_duration:
                # Add the clip up to this point
                clip_end = t
                try:
                    if current_speaker == 0:
                        clip = left_synced.subclip(segment_start, clip_end)
                    else:
                        clip = right_synced.subclip(segment_start, clip_end)
                    
                    # Ensure audio is included in the clip
                    if clip.audio is None:
                        print(f"Warning: No audio in clip from {segment_start} to {clip_end}")
                                        
                    clips.append(clip.set_fps(left_synced.fps))
                except Exception as e:
                    print(f"Error creating subclip from {segment_start} to {clip_end}: {str(e)}")
                    break
                
                segment_start = clip_end
                current_speaker = new_speaker

        # Add the final clip
        try:
            if current_speaker == 0:
                clip = left_synced.subclip(segment_start, min_duration)
            else:
                clip = right_synced.subclip(segment_start, min_duration)
            
            # Ensure audio is included in the final clip
            if clip.audio is None:
                print(f"Warning: No audio in final clip from {segment_start} to {min_duration}")
            
            # Resize final clip to match left's aspect ratio
            clip = resize_clip(clip, left_synced.w, left_synced.h)
            
            clips.append(clip.set_fps(left_synced.fps))
        except Exception as e:
            print(f"Error adding final clip: {str(e)}")

        print(f"Number of clips generated: {len(clips)}")

        if not clips:
            print("No clips were generated. Using left video as fallback.")
            final_video = left_synced
        else:
            print("Concatenating clips...")
            print(clips)
            final_video = concatenate_videoclips(clips, method="compose")

        # Ensure the final video has audio
        if final_video.audio is None:
            print("Warning: Final video has no audio. Attempting to add audio from left video.")
            final_video = final_video.set_audio(left_synced.audio)

        print(f"Writing final video to {output_path}...")
        final_video.write_videofile(output_path, fps=left_synced.fps, audio_codec='aac', audio=True)
        print("Video processing completed successfully.")
        
    except Exception as e:
        print(f"Error in process_videos: {str(e)}")
        raise

if __name__ == "__main__":
    if len(sys.argv) < 8:
        print("Usage: script.py left_camera main_camera right_camera left_audio right_audio output_path project_id [processing_params]")
        sys.exit(1)
        
    # Get the basic parameters
    left_camera, main_camera, right_camera, left_audio, right_audio, output_path, project_id = sys.argv[1:8]
    
    # Initialize default parameters
    speaker_bias = {'left': 1.0, 'main': 1.0, 'right': 1.0}
    min_clip_duration = 1.0
    merge_audio = True
    audio_params = {
        'noise_reduction': 0.05,
        'low_cut': 80,
        'high_cut': 8000
        # compression parameters will be determined automatically
    }
    
    # If processing parameters are provided as JSON string
    if len(sys.argv) > 8:
        try:
            import json
            processing_params = json.loads(sys.argv[8])
            
            # Update speaker bias if provided
            #if 'speaker_bias' in processing_params:
            #    speaker_bias.update(processing_params['speaker_bias'])
            
            # Update min clip duration if provided
            #if 'min_clip_duration' in processing_params:
            #    min_clip_duration = float(processing_params['min_clip_duration'])
            
            # Update audio merging preference if provided
            if 'merge_audio' in processing_params:
                merge_audio = bool(processing_params['merge_audio'])
            
            # Update audio parameters if provided
            if 'audio_params' in processing_params:
                audio_params.update(processing_params['audio_params'])
                
            print("Using custom processing parameters:")
            print(f"Speaker bias: {speaker_bias}")
            print(f"Min clip duration: {min_clip_duration}")
            print(f"Merge audio: {merge_audio}")
            print(f"Audio parameters: {audio_params}")
        except Exception as e:
            print(f"Error parsing processing parameters: {str(e)}")
            print("Using default parameters")
    
    # print durations of each file
    print(f"Left camera duration: {VideoFileClip(left_camera).duration}")
    print(f"Right camera duration: {VideoFileClip(right_camera).duration}")
    print(f"Left audio duration: {AudioFileClip(left_audio).duration}")
    print(f"Right audio duration: {AudioFileClip(right_audio).duration}")
    
    # Validate input files exist
    input_files = [left_camera, right_camera, left_audio, right_audio]
    for file_path in input_files:
        if not os.path.exists(file_path):
            print(f"Error: File not found: {file_path}")
            sys.exit(1)
    
    process_videos(
        left_camera, 
        right_camera, 
        left_audio, 
        right_audio, 
        output_path,
        speaker_bias=speaker_bias,
        min_clip_duration=min_clip_duration,
        audio_params=audio_params,
        merge_audio=merge_audio
    )
    
    print(f"Processing completed. Output saved to {output_path}")

