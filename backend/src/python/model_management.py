import os
import requests
from huggingface_hub import hf_hub_download

def download_models():
    # Base directory for model storage
    models_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'models')

    # Create subdirectories
    os.makedirs(os.path.join(models_dir, 'face_landmark_68'), exist_ok=True)
    os.makedirs(os.path.join(models_dir, 'tiny_face_detector'), exist_ok=True)

    # Download face landmark model
    landmark_files = [
        'face_landmark_68_model-weights_manifest.json',
        'face_landmark_68_model-shard1'
    ]
    for file in landmark_files:
        url = f"https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights/{file}"
        response = requests.get(url)
        with open(os.path.join(models_dir, 'face_landmark_68', file), 'wb') as f:
            f.write(response.content)
        print(f"Downloaded {file} to {os.path.join(models_dir, 'face_landmark_68')}")

    # Download tiny face detector model
    detector_files = [
        'tiny_face_detector_model-weights_manifest.json',
        'tiny_face_detector_model-shard1'
    ]
    for file in detector_files:
        url = f"https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights/{file}"
        response = requests.get(url)
        with open(os.path.join(models_dir, 'tiny_face_detector', file), 'wb') as f:
            f.write(response.content)
        print(f"Downloaded {file} to {os.path.join(models_dir, 'tiny_face_detector')}")

    # Download additional models from Hugging Face and save them in the models directory
    print("Downloading additional models from Hugging Face...")
    hf_hub_download(repo_id="opencv/opencv_zoo", filename="face_detection_yunet_2023mar.onnx", cache_dir=models_dir)
    hf_hub_download(repo_id="microsoft/resnet-50", filename="pytorch_model.bin", cache_dir=models_dir)

    print("Model download complete!")

if __name__ == "__main__":
    download_models()
