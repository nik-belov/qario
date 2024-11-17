import sys
import os
import time
import argparse
import numpy as np
from scipy.signal import correlate
import librosa
from moviepy.editor import VideoFileClip, concatenate_videoclips, CompositeVideoClip
import sync_video_audio


def eprint(*args, **kwargs):
    print(*args, **kwargs, file=sys.stderr)


def get_audio_features(audio_path: str):
    audio_signal, sr = librosa.load(audio_path, sr=16000)

    hop_length = round(sr / 100)
    mfcc = librosa.feature.mfcc(y=audio_signal, sr=sr, n_mfcc=1, hop_length=hop_length)
    return mfcc[0], 100


def normalize(features):
    return (features - np.mean(features)) / np.std(features)


def cross_correlation(a, b):
    return correlate(a, b, mode='full', method='fft')


def calculate_offset(left_video_path, right_video_path):
    left_audio_features, left_fps = get_audio_features(left_video_path)
    right_audio_features, right_fps = get_audio_features(right_video_path)

    left_audio_features = normalize(left_audio_features)
    right_audio_features = normalize(right_audio_features)

    corr = cross_correlation(left_audio_features, right_audio_features)
    offset = np.argmax(corr) - right_audio_features.shape[0] + 1
    offset_sec = offset / right_fps

    left_clip = VideoFileClip(left_video_path)
    right_clip = VideoFileClip(right_video_path)

    if offset_sec > 0:
        left_clip = left_clip.subclip(offset_sec)
    else:
        right_clip = right_clip.subclip(-offset_sec)

    min_duration = int(min(left_clip.duration, right_clip.duration))
    print("Min duration:", min_duration)
    left_clip = left_clip.subclip(0, min_duration)
    right_clip = right_clip.subclip(0, min_duration)

    new_left_path = "new_left_audio.wav"
    new_right_path = "new_right_audio.wav"

    left_clip.audio.write_audiofile(new_left_path, logger=None)
    right_clip.audio.write_audiofile(new_right_path, logger=None)

    return left_clip, right_clip, new_left_path, new_right_path


# def get_speech_segments(audio_path):
#     pipeline = Pipeline.from_pretrained("pyannote/speaker-diarization-3.1", use_auth_token="<token>")

#     # apply pretrained pipeline
#     diarization = pipeline(audio_path)

#     segments = []

#     # print the result
#     for turn, _, speaker in diarization.itertracks(yield_label=True):
#         print(f"start={turn.start:.1f}s stop={turn.end:.1f}s speaker_{speaker}")
#         segments.append((speaker, turn))
    
#     return segments


def switch(left_video_path, right_video_path, output_path):
    left_clip, right_clip, left_audio_path, right_audio_path = calculate_offset(left_video_path, right_video_path)
    
    min_duration = int(min(left_clip.duration, right_clip.duration))

    # speech_segments_raw = get_speech_segments(left_audio_clip)
    # speech_segments = []

    # curr_start = speech_segments_raw[0][1].start
    # curr_end = speech_segments_raw[0][1].end

    # for i in range(1, len(speech_segments_raw)):
    #     speaker, turn = speech_segments_raw[i]
    #     speaker_prev, turn_prev = speech_segments_raw[i - 1]

    #     if speaker == speaker_prev and turn.start - turn_prev.end < 1:
    #         curr_end = turn.end
    #     else:
    #         speech_segments.append((speaker, (curr_start, curr_end)))
    #         curr_start = turn.start
    #         curr_end = turn.end

    #     if i + 1 == len(speech_segments_raw):
    #         speech_segments.append((speaker, (curr_start, curr_end)))

    # print(speech_segments)

    speech_segments = [('SPEAKER_01', (0.03096875, 1.36409375)), ('SPEAKER_00', (2.41034375, 4.03034375)), ('SPEAKER_01', (4.03034375, 4.384718750000001)), ('SPEAKER_00', (4.232843750000001, 7.08471875)), ('SPEAKER_01', (8.40096875, 31.890968750000003)), ('SPEAKER_01', (17.47971875, 17.85096875)), ('SPEAKER_01', (26.27159375, 26.64284375)), ('SPEAKER_00', (31.82346875, 32.228468750000005)), ('SPEAKER_01', (32.228468750000005, 40.969718750000006)), ('SPEAKER_00', (38.877218750000004, 39.26534375)), ('SPEAKER_01', (41.37471875, 45.55971875)), ('SPEAKER_00', (44.040968750000005, 44.42909375)), ('SPEAKER_01', (45.99846875, 60.30846875)), ('SPEAKER_01', (47.46659375, 48.664718750000006)), ('SPEAKER_00', (60.51096875, 71.86784375)), ('SPEAKER_01', (72.12096875, 81.52034375000001)), ('SPEAKER_01', (72.82971875, 73.18409375)), ('SPEAKER_00', (77.08221875000001, 77.53784375000001)), ('SPEAKER_01', (81.99284375, 88.28721875000001)), ('SPEAKER_01', (83.62971875000001, 84.37221875)), ('SPEAKER_00', (87.07221875, 113.54909375000001)), ('SPEAKER_01', (114.20721875000001, 115.77659375)), ('SPEAKER_00', (115.45596875000001, 115.81034375)), ('SPEAKER_01', (115.81034375, 126.64409375000001)), ('SPEAKER_00', (127.16721875, 169.72596875000002)), ('SPEAKER_01', (170.41784375, 184.40721875)), ('SPEAKER_01', (172.83096875, 173.15159375000002)), ('SPEAKER_01', (176.96534375000002, 177.38721875000002)), ('SPEAKER_00', (178.75409375, 179.20971875)), ('SPEAKER_01', (184.77846875, 186.44909375)), ('SPEAKER_00', (186.63471875000002, 189.35159375)), ('SPEAKER_00', (186.93846875, 188.81159375000001)), ('SPEAKER_01', (190.54971875, 201.72096875000003)), ('SPEAKER_00', (201.83909375000002, 203.45909375000002)), ('SPEAKER_01', (204.06659375, 210.09096875)), ('SPEAKER_00', (210.09096875, 242.79471875000002)), ('SPEAKER_01', (244.06034375000002, 255.46784375000001)), ('SPEAKER_01', (244.09409375, 244.48221875000002)), ('SPEAKER_01', (253.17284375000003, 253.45971875)), ('SPEAKER_00', (256.26096875, 291.32721875000004)), ('SPEAKER_01', (291.93471875, 297.68909375000004)), ('SPEAKER_01', (292.52534375, 293.92596875000004)), ('SPEAKER_00', (297.68909375000004, 303.15659375)), ('SPEAKER_00', (297.75659375000004, 300.28784375000004)), ('SPEAKER_01', (303.15659375, 305.29971875)), ('SPEAKER_01', (303.19034375, 303.98346875000004)), ('SPEAKER_01', (305.45159375000003, 305.89034375)), ('SPEAKER_00', (311.02034375, 312.21846875)), ('SPEAKER_00', (311.18909375000004, 314.00721875)), ('SPEAKER_00', (317.33159375, 318.63096875))]

    speech_segments = [segment for segment in speech_segments if segment[1][1] < min_duration]

    final_video = []
    last_end_time = 0

    # switcher
    for speaker, (start, end) in speech_segments:
        if end < last_end_time:
            continue

        if start < last_end_time:
            start = last_end_time

        if end - start < 1:
            continue

        if speaker == 'SPEAKER_00':
            subclip = left_clip.subclip(last_end_time, end)
        elif speaker == 'SPEAKER_01':
            subclip = right_clip.subclip(last_end_time, end)

        last_end_time = end    
        final_video.append(subclip)

    final_clip = concatenate_videoclips(final_video, method="compose")
    final_clip.write_videofile(output_path, codec="libx264", fps=24)


def main(left_video_path, left_audio_path, right_video_path, right_audio_path, output_path):
    left_video = sync_video_audio.sync(left_video_path, left_audio_path)
    right_video = sync_video_audio.sync(right_video_path, right_audio_path)

    synced_left_path = "new_left_path.mp4"
    synced_right_path = "new_right_path.mp4"

    left_video.write_videofile(synced_left_path, logger=None)
    right_video.write_videofile(synced_right_path, logger=None)

    switch(synced_left_path, synced_right_path, output_path)


if __name__ == "__main__":
    if len(sys.argv) < 8:
        print("Usage: script.py left_camera main_camera right_camera left_audio right_audio output_path project_id [processing_params]")
        sys.exit(1)
        
    # Get the basic parameters
    left_camera, main_camera, right_camera, left_audio, right_audio, output_path, project_id = sys.argv[1:8]
    
    start = time.time()

    main(
        left_video_path=left_camera,
        left_audio_path=left_audio,
        right_video_path=right_camera,
        right_audio_path=right_audio,
        output_path=output_path
    )

    finish = time.time()
    eprint(f"Proccessing took: {int(finish - start)} seconds")
