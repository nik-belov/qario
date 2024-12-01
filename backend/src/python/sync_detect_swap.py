import os
import sys
import time
import argparse
from moviepy.editor import VideoFileClip, concatenate_videoclips, CompositeAudioClip
from random import randint

import numpy as np
from vasync import vasync
from vvsync import vvsync
from find_speech import find_speech_segments, speaker_diarization


def eprint(*args, **kwargs):
    print(*args, **kwargs, file=sys.stderr)


def merge_speech(left_speech, rght_speech):
    out = left_speech + rght_speech
    out.sort(key=lambda d: d['start'])
    return out


def main(left_video_path, left_audio_path, rght_video_path, rght_audio_path, main_video_path, main_audio_path, one_speaker_on_mic=False):
    left_video = VideoFileClip(left_video_path) if left_audio_path is None else vasync(left_video_path, left_audio_path)
    rght_video = VideoFileClip(rght_video_path) if rght_audio_path is None else vasync(rght_video_path, rght_audio_path)
    main_video = VideoFileClip(main_video_path) if main_audio_path is None else vasync(main_video_path, main_audio_path)

    #left_video, rght_video = vvsync(left_video, rght_video)

    if one_speaker_on_mic:
        left_speech = find_speech_segments(left_video, "SPEAKER_00")
        rght_speech = find_speech_segments(rght_video, "SPEAKER_01")
        speech_segments = merge_speech(left_speech, rght_speech)

        mixed_audio = CompositeAudioClip([left_video.audio, rght_video.audio])
        left_video.audio = mixed_audio
        rght_video.audio = mixed_audio
    else:
        speech_segments = speaker_diarization(left_video)
    
    final_video = []
    last_end_time = 0

    # switcher
    for segment in speech_segments:
        speaker = segment['speaker']
        start = segment['start']
        end = segment['end']

        if end < last_end_time:
            continue

        if start < last_end_time:
            start = last_end_time

        if end - start < 1.0:
            continue

        curr_clip = left_video if speaker == 'SPEAKER_00' else rght_video

        n = int((end - last_end_time) // 7) + 2
        ts = np.linspace(last_end_time, end, n)

        for i in range(len(ts) - 1):
            if i % 2 == 0:
                final_video.append(curr_clip.subclip(ts[i], ts[i + 1]))
            else:
                final_video.append(main_video.subclip(ts[i], ts[i + 1]))

        last_end_time = end

    final_clip = concatenate_videoclips(final_video, method="compose")
    final_clip.write_videofile("./out/switch_camera.mp4")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()

    parser.add_argument("--left_video_path", type=str, required=True)
    parser.add_argument("--left_audio_path", type=str, required=False)
    parser.add_argument("--right_video_path", type=str, required=True)
    parser.add_argument("--right_audio_path", type=str, required=False)
    parser.add_argument("--main_video_path", type=str, required=False)
    parser.add_argument("--main_audio_path", type=str, required=False)

    args = parser.parse_args()
    
    out_dir = "./out/"
    tmp_dir = "./tmp/"
    os.makedirs(out_dir, exist_ok=True)
    os.makedirs(tmp_dir, exist_ok=True)

    start = time.time()

    main(
        left_video_path=args.left_video_path,
        left_audio_path=args.left_audio_path,
        rght_video_path=args.right_video_path,
        rght_audio_path=args.right_audio_path,
        main_video_path=args.main_video_path,
        main_audio_path=args.main_audio_path


    )

    finish = time.time()
    duration = finish - start

    eprint(f"Syncing videos took {duration:.1f} seconds")