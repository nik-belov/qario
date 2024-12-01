import os
import sys
import time
import argparse
from collections import defaultdict

from silero_vad import load_silero_vad, read_audio, get_speech_timestamps
from pyannote.audio import Pipeline
from moviepy.editor import VideoFileClip


def eprint(*args, **kwargs):
    print(*args, **kwargs, file=sys.stderr)


def find_speech_segments(clip: VideoFileClip, speaker: str):
    MIN_SILENCE_DURATION = 1.0
    THRESHOLD = 0.5  # increase to exclude quiet speech

    tmp_file = "./tmp/find_speech_segments.wav"
    clip.audio.write_audiofile(tmp_file)

    model = load_silero_vad()
    wav = read_audio(tmp_file)
    speech_segments = get_speech_timestamps(wav, model, return_seconds=True, threshold=THRESHOLD, min_silence_duration_ms=MIN_SILENCE_DURATION * 1000)
    speech_segments = [{'speaker': speaker} | segment for segment in speech_segments]
    return speech_segments


def process_speech_segments(raw_speech_segments):
    MIN_SILENCE_DURATION = 1.0

    speech_segments = []

    curr_start = raw_speech_segments[0]['start']
    curr_end   = raw_speech_segments[0]['end']

    for i in range(1, len(raw_speech_segments)):
        curr_turn = raw_speech_segments[i]
        prev_turn = raw_speech_segments[i - 1]

        if curr_turn['start'] - prev_turn['end'] < MIN_SILENCE_DURATION:
            curr_end = curr_turn['end']
        else:
            speech_segments.append({'start': curr_start, 'end': curr_end})
            curr_start = curr_turn['start']
            curr_end   = curr_turn['end']

        if i + 1 == len(raw_speech_segments):
            speech_segments.append({'start': curr_start, 'end': curr_end})
    
    return speech_segments


def to_output(speech_segments):
    out = []

    for speaker, segments in speech_segments.items():
        #speech_segments[speaker].sort(key=lambda segment: segment['start'])
        processed_segments = process_speech_segments(segments)
        out.extend(({'speaker': speaker} | segment for segment in processed_segments))

    out.sort(key=lambda d: d['start'])
    return out


def speaker_diarization(clip: VideoFileClip):
    #pipeline = Pipeline.from_pretrained("pyannote/speaker-diarization-3.1", use_auth_token="<token>")

    #tmp_file = "./tmp/speaker_diarization.wav"
    #clip.audio.write_audiofile(tmp_file)

    #raw_speech_segments = defaultdict(list)

    raw_speech_segments = {'SPEAKER_01': [{'start': 0.03096875, 'end': 1.0265937500000002}, {'start': 4.48596875, 'end': 8.02971875}, {'start': 8.09721875, 'end': 8.130968750000001}, {'start': 8.333468750000002, 'end': 8.35034375}, {'start': 9.41346875, 'end': 10.797218750000003}, {'start': 27.199718750000002, 'end': 27.824093750000003}, {'start': 27.97596875, 'end': 28.02659375}, {'start': 28.836593750000002, 'end': 28.887218750000002}, {'start': 28.90409375, 'end': 29.039093750000003}, {'start': 32.51534375, 'end': 34.48971875}, {'start': 36.80159375, 'end': 43.56846875}, {'start': 44.19284375, 'end': 61.48971875}, {'start': 99.82971875000001, 'end': 122.44221875000001}, {'start': 123.06659375000001, 'end': 131.06534375}, {'start': 131.30159375, 'end': 141.24096875}, {'start': 172.56096875, 'end': 175.24409375000002}, {'start': 175.42971875, 'end': 176.62784375}, {'start': 177.20159375, 'end': 188.87909375}, {'start': 189.77346875, 'end': 198.78471875000002}, {'start': 199.13909375, 'end': 200.91096875000002}, {'start': 201.58596875, 'end': 211.87971875000002}, {'start': 234.44159375, 'end': 236.12909375}, {'start': 236.14596875, 'end': 256.14284375}, {'start': 259.39971875000003, 'end': 260.00721875}, {'start': 260.58096875, 'end': 262.47096875}, {'start': 262.80846875000003, 'end': 263.63534375}, {'start': 264.71534375000005, 'end': 276.93284375}, {'start': 277.11846875000003, 'end': 278.58659375}, {'start': 279.16034375000004, 'end': 285.08346875}, {'start': 286.11284375, 'end': 289.30221875}, {'start': 289.67346875000004, 'end': 293.55471875}, {'start': 300.01784375, 'end': 300.47346875}, {'start': 317.55096875000004, 'end': 318.15846875}, {'start': 318.17534375, 'end': 318.24284375}, {'start': 318.47909375, 'end': 319.32284375}, {'start': 319.87971875, 'end': 325.16159375}, {'start': 325.43159375000005, 'end': 341.64846875}, {'start': 341.95221875000004, 'end': 342.23909375}], 'SPEAKER_00': [{'start': 7.844093750000001, 'end': 9.41346875}, {'start': 12.24846875, 'end': 16.99034375}, {'start': 61.557218750000004, 'end': 95.00346875000001}, {'start': 95.44221875000001, 'end': 95.74596875}, {'start': 95.98221875, 'end': 99.66096875000001}, {'start': 141.30846875, 'end': 162.04784375}, {'start': 162.19971875000002, 'end': 172.25721875000002}, {'start': 188.87909375, 'end': 189.77346875}, {'start': 205.29846875, 'end': 205.46721875}, {'start': 211.91346875000002, 'end': 223.91159375}, {'start': 224.36721875, 'end': 234.13784375}, {'start': 235.43721875000003, 'end': 236.14596875}, {'start': 256.14284375, 'end': 259.07909375}, {'start': 259.21409375, 'end': 259.39971875000003}, {'start': 293.95971875000004, 'end': 317.50034375}, {'start': 317.88846875, 'end': 318.17534375}, {'start': 322.86659375, 'end': 323.17034375000003}]}

    # diarization = pipeline(tmp_file)
    # for turn, _, speaker in diarization.itertracks(yield_label=True):
    #     raw_speech_segments[speaker].append({'start': turn.start, 'end': turn.end})

    print(raw_speech_segments)

    # if only 2 speakers detected
    if len(raw_speech_segments) <= 2:
        return to_output(raw_speech_segments)
    
    # maybe calculate overall speech duration instead of number of individual talks
    speaker_num_segments = [(speaker, len(segments)) for speaker, segments in raw_speech_segments.items()]
    speaker_num_segments.sort(key=lambda x: x[1], reverse=True)

    # get most `talkative`
    speaker_0 = speaker_num_segments[0][0]
    speaker_1 = speaker_num_segments[1][0]

    def f(speaker):
        if speaker == speaker_0:
            return "SPEAKER_00"
        
        if speaker == speaker_1:
            return "SPEAKER_01"
        
        return "SPEAKER_02"
    
    speech_segments = defaultdict(list)

    for speaker, segments in raw_speech_segments.items():
        f_speaker = f(speaker)

        if f_speaker != "SPEAKER_02" or len(raw_speech_segments) == 3:
            speech_segments[f_speaker].extend(segments)

    return to_output(speech_segments)


def main(video_path: str):
    video = VideoFileClip(video_path)
    speech_segments = speaker_diarization(video)
    print(speech_segments)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()

    parser.add_argument("--video_path", type=str, required=True)

    args = parser.parse_args()
    
    tmp_dir = "./tmp/"
    os.makedirs(tmp_dir, exist_ok=True)

    start = time.time()

    main(
        video_path=args.video_path,
    )

    finish = time.time()
    duration = finish - start

    eprint(f"Finding speech segments took {duration:.1f} seconds")