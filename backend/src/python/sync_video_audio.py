import sys
import time
import argparse
import cv2
import mediapipe as mp
import numpy as np
import librosa
from scipy.signal import correlate
from moviepy.editor import VideoFileClip, AudioFileClip


def eprint(*args, **kwargs):
    print(*args, **kwargs, file=sys.stderr)


def calculate_lip_movement(frame, landmarks):
    # https://github.com/google-ai-edge/mediapipe/issues/2040
    # this give points outisde lips
    LIP_POINTS_INDICES = [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 61, 185, 40, 39, 37, 0, 267, 269, 270, 409]
    # this give points inside lips
    #LIP_POINTS_INDICES = [78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 78, 191, 80, 81, 82, 13, 312, 311, 310, 415]

    # build convex hull of lip points and calculate its area
    lip_points = [landmarks[i] for i in LIP_POINTS_INDICES]
    points = np.array([(point.x * frame.shape[1], point.y * frame.shape[0]) for point in lip_points], dtype=np.int32)
    hull = cv2.convexHull(points)
    area = cv2.contourArea(hull)
    return area


def get_lip_area_for_each_frame(video_path: str):
    cap = cv2.VideoCapture(video_path)
    fps = cap.get(cv2.CAP_PROP_FPS)
    
    areas = []

    mp_face_mesh = mp.solutions.face_mesh
    with mp_face_mesh.FaceMesh(min_detection_confidence=0.5, min_tracking_confidence=0.5) as face_mesh:
        
        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                break

            frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            results = face_mesh.process(frame)

            if results.multi_face_landmarks:
                for landmarks in results.multi_face_landmarks:
                    areas.append(calculate_lip_movement(frame, landmarks.landmark))

    cap.release()
    cv2.destroyAllWindows()

    return np.array(areas, dtype=np.float32), fps


def get_audio_features(audio_path: str, fps: float):
    audio_signal, sr = librosa.load(audio_path, sr=None)

    hop_length = round(sr / fps)
    mfcc = librosa.feature.mfcc(y=audio_signal, sr=sr, n_mfcc=1, hop_length=hop_length)
    return mfcc[0]


def normalize(features):
    return (features - np.min(features)) / (np.max(features) - np.min(features))


def cross_correlation(a, b):
    return correlate(a, b, mode='full', method='fft')


def get_possible_offsets(corr, substract, fps, n=5):
    ind = np.argpartition(corr, -n)[-n:]
    corr_vals = np.sort(corr[ind])[::-1]
    offs = ind[np.argsort(corr[ind])][::-1] - substract + 1
    return corr_vals, offs / fps
    

def calculate_offset(video_path, audio_path) -> float:
    eprint("Extracting video features...")
    video_features, fps = get_lip_area_for_each_frame(video_path)

    eprint("Extracting audio features...")
    audio_features = get_audio_features(audio_path, fps)

    video_features = normalize(video_features)
    audio_features = normalize(audio_features)

    corr = cross_correlation(video_features, audio_features)

    # possible values of offset
    corr_values, possible_offsets = get_possible_offsets(corr, audio_features.shape[0], fps)
    eprint(f"Correlation: {corr_values}")
    eprint(f"Possible offsets: {possible_offsets}")

    return possible_offsets[0]


def sync(video_path: str, audio_path: str):
    # shift audio on this value (if positive - cut video)
    eprint("Calculating offset...")
    offset_sec = calculate_offset(video_path, audio_path)
    if offset_sec < -30:
        offset_sec += 1.3
    eprint(f"Video-to-audio offset: {offset_sec} seconds")

    video_clip = VideoFileClip(video_path)
    audio_clip = AudioFileClip(audio_path)

    if offset_sec > 0:
        video_clip = video_clip.subclip(offset_sec)
    else:
        audio_clip = audio_clip.subclip(-offset_sec)

    eprint("Merging video and audio...")
    synced_clip = video_clip.set_audio(audio_clip)
    return synced_clip


def main(video_path: str, audio_path: str, output_path: str):
    output_clip = sync(video_path, audio_path)
    output_clip.write_videofile(output_path, logger=None)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="video-audio synchronization")

    parser.add_argument("--video_path", type=str, required=True)
    parser.add_argument("--audio_path", type=str, required=True)
    parser.add_argument("--output_path", type=str, required=True)

    args = parser.parse_args()
    
    start = time.time()

    main(
        video_path=args.video_path,
        audio_path=args.audio_path,
        output_path=args.output_path
    )

    finish = time.time()
    eprint(f"Proccessing took: {int(finish - start)} seconds")
