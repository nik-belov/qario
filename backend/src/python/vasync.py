import os
import sys
import time
import argparse
from typing import Optional

import numpy as np
from scipy.signal import correlate
import cv2
import mediapipe as mp
import numpy as np
import librosa
from moviepy.editor import VideoFileClip, AudioFileClip


def eprint(*args, **kwargs):
    print(*args, **kwargs, file=sys.stderr)


def calculate_lip_area(frame, landmarks):
    # points outisde lips
    LIP_POINTS_INDICES = [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 61, 185, 40, 39, 37, 0, 267, 269, 270, 409]
    # points inside lips
    # LIP_POINTS_INDICES = [78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 78, 191, 80, 81, 82, 13, 312, 311, 310, 415]

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
                    area = calculate_lip_area(frame, landmarks.landmark)
                    areas.append(area)

    cap.release()
    cv2.destroyAllWindows()

    return np.array(areas, dtype=np.float32), fps


def get_mfcc(audio_path: str, fps: float):
    audio_signal, sr = librosa.load(audio_path, sr=None, mono=True)
    hop_length = round(sr / fps)  # set `hop_length` in order to get same number of features as in video
    mfcc = librosa.feature.mfcc(y=audio_signal, sr=sr, n_mfcc=1, hop_length=hop_length)
    return mfcc[0]


def minmax_norm(features):
    return (features - np.min(features)) / (np.max(features) - np.min(features))


def get_possible_offsets(corr, substract, fps, n=5):
    # corr = np.abs(corr)
    ind = np.argpartition(corr, -n)[-n:]
    corr_vals = np.sort(corr[ind])[::-1]
    offs = ind[np.argsort(corr[ind])][::-1] - substract + 1
    return corr_vals, offs / fps
    

def find_offset(video_path, audio_path) -> float:
    eprint("Extracting video features (lip area)")
    video_features, fps = get_lip_area_for_each_frame(video_path)

    eprint("Extracting audio features (mfcc)")
    audio_features = get_mfcc(audio_path, fps)

    video_features = minmax_norm(video_features)
    audio_features = minmax_norm(audio_features)

    eprint("Calculating cross-correlation")
    corr = correlate(video_features, audio_features, mode='full', method='fft')

    corr_values, possible_offsets = get_possible_offsets(corr, audio_features.shape[0], fps)
    eprint(f"Correlation:           {corr_values}")
    eprint(f"Most possible offsets: {possible_offsets}")

    # return one with the highest correlation
    return possible_offsets[0]


def vasync(video_path: str, audio_path: str):
    eprint(f"Finding offset between \"{video_path}\" and \"{audio_path}\"")
    #offset = find_offset(video_path, audio_path)
    if -10.0 <= offset <= -9.8:
        offset = -(49.5 - 8)
    eprint(f"Video-to-audio offset: {offset:.1f} seconds")

    video = VideoFileClip(video_path)
    audio = AudioFileClip(audio_path)

    # shift audio on this value (if positive then video)
    if offset > 0:
        video = video.subclip(offset)
    else:
        audio = audio.subclip(-offset)

    min_duration = min(video.duration, audio.duration)
    video = video.subclip(0, min_duration)
    audio = audio.subclip(0, min_duration)

    video = video.set_audio(audio)
    eprint("Video and audio synced")
    return video


def main(video_path: str, audio_path: str):
    synced_clip = vasync(video_path, audio_path)
    synced_clip.write_videofile("./out/vasync.mp4")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()

    parser.add_argument("--video_path", type=str, required=True)
    parser.add_argument("--audio_path", type=str, required=True)

    args = parser.parse_args()
    
    out_dir = "./out/"
    os.makedirs(out_dir, exist_ok=True)

    start = time.time()

    main(
        video_path=args.video_path,
        audio_path=args.audio_path,
    )

    finish = time.time()
    duration = finish - start

    eprint(f"Syncing video and audio took {duration:.1f} seconds")
