import os
import tempfile
import subprocess
import boto3
import openai
from PIL import Image
import io

s3 = boto3.client('s3')
openai.api_key = os.getenv('OPENAI_API_KEY')

def analyze_video_content(video_url):
    with tempfile.TemporaryDirectory() as temp_dir:
        input_video = os.path.join(temp_dir, 'input.mp4')
        audio_file = os.path.join(temp_dir, 'audio.mp3')
        frames_dir = os.path.join(temp_dir, 'frames')
        os.makedirs(frames_dir, exist_ok=True)

        # Download the input video
        s3.download_file('your-bucket-name', video_url, input_video)

        # Extract audio from video
        subprocess.run(['ffmpeg', '-i', input_video, '-q:a', '0', '-map', 'a', audio_file], check=True)

        # Generate frames (1 per second)
        subprocess.run(['ffmpeg', '-i', input_video, '-vf', 'fps=1', f'{frames_dir}/frame%d.jpg'], check=True)

        # Get video duration
        result = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', input_video], capture_output=True, text=True, check=True)
        duration = int(float(result.stdout))

        # Transcribe audio using OpenAI Whisper API
        with open(audio_file, 'rb') as audio:
            transcript = openai.Audio.transcribe("whisper-1", audio)['text']

        # Analyze frames using OpenAI API
        frame_descriptions = {}
        for i in range(1, duration + 1):
            frame_path = os.path.join(frames_dir, f'frame{i}.jpg')
            if os.path.exists(frame_path):
                with Image.open(frame_path) as img:
                    img_byte_arr = io.BytesIO()
                    img.save(img_byte_arr, format='JPEG')
                    img_byte_arr = img_byte_arr.getvalue()

                response = openai.ChatCompletion.create(
                    model="gpt-4-vision-preview",
                    messages=[
                        {
                            "role": "user",
                            "content": [
                                {"type": "text", "text": "Describe what's happening in this image in a single sentence."},
                                {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{img_byte_arr.decode('utf-8')}"}}
                            ],
                        }
                    ],
                )
                frame_descriptions[i] = response.choices[0].message.content

    return {"transcript": transcript, "frame_descriptions": frame_descriptions}

# Usage
result = analyze_video_content('path/to/video/in/s3')
print(result)