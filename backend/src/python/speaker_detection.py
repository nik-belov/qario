import cv2
import numpy as np
import face_recognition
import os
import sys
import json
import traceback
import subprocess

def print_flush(*args, **kwargs):
    print(*args, **kwargs)
    sys.stdout.flush()

print_flush("Python script started")

def detect_faces(image):
    face_locations = face_recognition.face_locations(image, model="hog")
    return face_locations

def analyze_lip_movement(prev_landmarks, current_landmarks):
    if not prev_landmarks or not current_landmarks:
        return 0
    
    prev_mouth = np.mean(prev_landmarks['top_lip'] + prev_landmarks['bottom_lip'], axis=0)
    current_mouth = np.mean(current_landmarks['top_lip'] + current_landmarks['bottom_lip'], axis=0)
    return np.linalg.norm(current_mouth - prev_mouth)

def get_video_info(video_path):
    cmd = ['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-count_packets',
           '-show_entries', 'stream=width,height,nb_read_packets,r_frame_rate',
           '-of', 'json', video_path]
    result = subprocess.run(cmd, capture_output=True, text=True)
    info = json.loads(result.stdout)['streams'][0]
    width = int(info['width'])
    height = int(info['height'])
    total_frames = int(info['nb_read_packets'])
    fps = eval(info['r_frame_rate'])
    return width, height, total_frames, fps

def process_video(input_video, output_video):
    try:
        print_flush(f"Processing video: {input_video}")
        print_flush(f"Output video: {output_video}")

        width, height, total_frames, fps = get_video_info(input_video)
        print_flush(f"Video properties: FPS={fps}, Width={width}, Height={height}, Total Frames={total_frames}")

        cap = cv2.VideoCapture(input_video)
        frames_to_process = range(0, total_frames, int(fps/2))  # Process 2 frames per second
        speaking_frames = []

        prev_landmarks = None
        for i, frame_number in enumerate(frames_to_process):
            if i % 10 == 0:  # Print progress every 10 frames
                print_flush(f"Processing frame {i}/{len(frames_to_process)}")
            
            cap.set(cv2.CAP_PROP_POS_FRAMES, frame_number)
            ret, frame = cap.read()
            if not ret:
                break

            rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            face_locations = detect_faces(rgb_frame)

            max_movement = 0
            speaking_face = None

            for face_location in face_locations:
                top, right, bottom, left = face_location
                face_image = rgb_frame[top:bottom, left:right]
                landmarks = face_recognition.face_landmarks(face_image)

                if landmarks and prev_landmarks:
                    movement = analyze_lip_movement(prev_landmarks[0], landmarks[0])
                    if movement > max_movement:
                        max_movement = movement
                        speaking_face = face_location

                prev_landmarks = landmarks

            if speaking_face:
                speaking_frames.append({
                    "start_time": frame_number / fps,
                    "bbox": {
                        "top_left": [speaking_face[3], speaking_face[0]],
                        "bottom_right": [speaking_face[1], speaking_face[2]]
                    }
                })

        cap.release()

        # Generate ffmpeg filter complex
        filter_complex = ""
        for i, frame in enumerate(speaking_frames):
            next_frame = speaking_frames[i+1] if i+1 < len(speaking_frames) else {"start_time": frame["start_time"] + 0.5}
            duration = next_frame["start_time"] - frame["start_time"]

            x1, y1 = frame["bbox"]["top_left"]
            x2, y2 = frame["bbox"]["bottom_right"]
            cx, cy = (x1 + x2) // 2, (y1 + y2) // 2
            w, h = x2 - x1, y2 - y1

            # Expand the box
            expand_factor = 2.75
            new_w = int(w * expand_factor)
            new_h = int(h * expand_factor)
            new_x1 = max(0, cx - new_w // 2)
            new_y1 = max(0, cy - new_h // 2)
            new_x2 = min(width, new_x1 + new_w)
            new_y2 = min(height, new_y1 + new_h)

            filter_complex += f"[0:v]trim=start={frame['start_time']}:duration={duration},setpts=PTS-STARTPTS,"
            filter_complex += f"crop={new_x2-new_x1}:{new_y2-new_y1}:{new_x1}:{new_y1},"
            filter_complex += f"scale={width}:{height}:force_original_aspect_ratio=increase,"
            filter_complex += f"crop={width}:{height},setsar=1[v{i}];"

        filter_complex += "".join(f"[v{i}]" for i in range(len(speaking_frames)))
        filter_complex += f"concat=n={len(speaking_frames)}:v=1:a=0[outv]"

        # Run ffmpeg command
        ffmpeg_cmd = [
            "ffmpeg", "-y",
            "-i", input_video,
            "-filter_complex", filter_complex,
            "-map", "[outv]",
            "-map", "0:a",
            output_video
        ]

        print_flush("Running ffmpeg command")
        subprocess.run(ffmpeg_cmd, check=True)

        print_flush("Video processing completed successfully")
        return {"processedVideoUrl": output_video}
    except Exception as e:
        print_flush(f"Error processing video: {str(e)}", file=sys.stderr)
        traceback.print_exc(file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    try:
        print_flush(f"Received arguments: {sys.argv}")
        if len(sys.argv) != 4:
            print_flush(f"Usage: python {sys.argv[0]} <input_video> <output_video> <project_id>", file=sys.stderr)
            sys.exit(1)

        input_video = os.path.abspath(sys.argv[1])
        output_video = os.path.abspath(sys.argv[2])
        project_id = sys.argv[3]

        result = process_video(input_video, output_video)
        print_flush(json.dumps(result))
    except Exception as e:
        print_flush(f"Unhandled exception: {str(e)}", file=sys.stderr)
        traceback.print_exc(file=sys.stderr)
        sys.exit(1)
