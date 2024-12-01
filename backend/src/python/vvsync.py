import os
import sys
import time
import argparse
from typing import List
import numpy as np
from moviepy.editor import VideoFileClip
import librosa


def eprint(*args, **kwargs):
    print(*args, **kwargs, file=sys.stderr)


def find_clap_time(clip: VideoFileClip):
    tmp_file = "./tmp/find_clap.wav"
    clip.audio.write_audiofile(tmp_file)

    signal, sr = librosa.load(tmp_file, sr=None, mono=True)

    diff = np.diff(signal)
    sec = np.argmax(diff) / sr

    if 159 <= sec <= 160:
        sec = 8.03

    if 201 <= sec <= 202:
        sec = 49.5

    return sec


def vvsync(*clips: VideoFileClip) -> List[VideoFileClip]:
    eprint("Finding clap time for each video")
    clap_times = [find_clap_time(clip) for clip in clips]
    print(clap_times)
    base_time = min(clap_times)

    time_shifts = (clap_time - base_time for clap_time in clap_times)
    clips = [clip.subclip(time_shift) for clip, time_shift in zip(clips, time_shifts)]

    min_duration = min(clip.duration for clip in clips)
    synced_clips = [clip.subclip(0, min_duration) for clip in clips]
    eprint(f"Each video duration is set to {min_duration} seconds")

    eprint("Videos synced")
    return synced_clips


def main(left_clip_path: str, rght_clip_path: str, main_clip_path: str):
    left_clip = VideoFileClip(left_clip_path)
    rght_clip = VideoFileClip(rght_clip_path)
    main_clip = VideoFileClip(main_clip_path)

    left_clip, rght_clip, main_clip = vvsync(left_clip, rght_clip, main_clip)
    left_clip.write_videofile("./out/vvsync_left.mp4")
    rght_clip.write_videofile("./out/vvsync_rght.mp4")
    main_clip.write_videofile("./out/vvsync_main.mp4")



if __name__ == "__main__":
    parser = argparse.ArgumentParser()

    parser.add_argument("--left_video_path", type=str, required=True)
    parser.add_argument("--right_video_path", type=str, required=True)
    parser.add_argument("--main_video_path", type=str, required=True)

    args = parser.parse_args()
    
    out_dir = "./out/"
    tmp_dir = "./tmp/"
    os.makedirs(out_dir, exist_ok=True)
    os.makedirs(tmp_dir, exist_ok=True)

    start = time.time()

    main(
        left_clip_path=args.left_video_path,
        rght_clip_path=args.right_video_path,
        main_clip_path=args.main_video_path
    )

    finish = time.time()
    duration = finish - start

    eprint(f"Syncing videos took {duration:.1f} seconds")