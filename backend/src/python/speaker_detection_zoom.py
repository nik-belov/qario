import cv2
import numpy as np
import face_recognition
import os
import sys
import json
import traceback
import subprocess
from multiprocessing import Pool, cpu_count

def print_flush(*args, **kwargs):
    print(*args, **kwargs)
    sys.stdout.flush()

print_flush("Python script started")

def bbox_iou(box1, box2):
    """Calculate IOU between two bounding boxes"""
    x1_1, y1_1 = box1["top_left"]
    x2_1, y2_1 = box1["bottom_right"]
    x1_2, y1_2 = box2["top_left"]
    x2_2, y2_2 = box2["bottom_right"]
    
    # Calculate intersection
    x1_i = max(x1_1, x1_2)
    y1_i = max(y1_1, y1_2)
    x2_i = min(x2_1, x2_2)
    y2_i = min(y2_1, y2_2)
    
    if x2_i < x1_i or y2_i < y1_i:
        return 0.0
    
    intersection = (x2_i - x1_i) * (y2_i - y1_i)
    
    # Calculate union
    area1 = (x2_1 - x1_1) * (y2_1 - y1_1)
    area2 = (x2_2 - x1_2) * (y2_2 - y1_2)
    union = area1 + area2 - intersection
    
    return intersection / union

def detect_faces_fast(frame):
    small_frame = cv2.resize(frame, (0, 0), fx=0.25, fy=0.25)
    gray_frame = cv2.cvtColor(small_frame, cv2.COLOR_RGB2GRAY)
    
    face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')
    faces = face_cascade.detectMultiScale(gray_frame, 1.1, 4)
    
    face_locations = []
    for (x, y, w, h) in faces:
        face_locations.append(
            (int(y*4), int((x+w)*4), int((y+h)*4), int(x*4))
        )
    
    return face_locations

def process_frame(args):
    frame_number, frame, fps = args
    face_locations = detect_faces_fast(frame)
    
    speaking_frame = None
    if face_locations:
        speaking_frame = {
            "start_time": frame_number / fps,
            "bbox": {
                "top_left": [face_locations[0][3], face_locations[0][0]],
                "bottom_right": [face_locations[0][1], face_locations[0][2]]
            }
        }
    
    return speaking_frame

def merge_similar_segments(speaking_frames, iou_threshold=0.7, min_duration=1.0):
    """Merge similar segments and filter out short duration switches"""
    if not speaking_frames:
        return []
    
    merged = []
    current_segment = speaking_frames[0].copy()
    
    for i in range(1, len(speaking_frames)):
        current_frame = speaking_frames[i]
        
        # Calculate IOU between current frame and current segment
        iou = bbox_iou(current_frame["bbox"], current_segment["bbox"])
        
        # If boxes are similar enough, extend current segment
        if iou >= iou_threshold:
            continue
        else:
            # Check if the previous segment was long enough
            duration = current_frame["start_time"] - current_segment["start_time"]
            if duration >= min_duration:
                merged.append(current_segment)
                current_segment = current_frame.copy()
            else:
                # If duration is too short, keep the previous segment
                continue
    
    # Add the last segment if it's long enough
    if speaking_frames[-1]["start_time"] - current_segment["start_time"] >= min_duration:
        merged.append(current_segment)
    
    return merged

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
        frames_to_process = range(0, total_frames, int(fps/4))
        frames = []
        
        for frame_number in frames_to_process:
            cap.set(cv2.CAP_PROP_POS_FRAMES, frame_number)
            ret, frame = cap.read()
            if not ret:
                break
            frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            frames.append((frame_number, frame, fps))

        with Pool(processes=cpu_count()) as pool:
            speaking_frames = pool.map(process_frame, frames)
        
        speaking_frames = [f for f in speaking_frames if f is not None]
        
        # Merge similar segments and filter out short switches
        speaking_frames = merge_similar_segments(speaking_frames, 
                                              iou_threshold=0.6,  # 60% overlap threshold
                                              min_duration=1.0)   # 1 second minimum duration

        cap.release()

        filter_complex = ""
        for i, frame in enumerate(speaking_frames):
            next_frame = speaking_frames[i+1] if i+1 < len(speaking_frames) else {"start_time": frame["start_time"] + 0.25}
            duration = next_frame["start_time"] - frame["start_time"]

            x1, y1 = frame["bbox"]["top_left"]
            x2, y2 = frame["bbox"]["bottom_right"]
            cx, cy = (x1 + x2) // 2, (y1 + y2) // 2
            w, h = x2 - x1, y2 - y1

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
