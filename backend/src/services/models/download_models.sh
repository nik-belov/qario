#!/bin/bash

# Create subdirectories
mkdir -p face_landmark_68 tiny_face_detector

# Download face landmark model
curl -O https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights/face_landmark_68_model-weights_manifest.json
curl -O https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights/face_landmark_68_model-shard1

# Download tiny face detector model
curl -O https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights/tiny_face_detector_model-weights_manifest.json
curl -O https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights/tiny_face_detector_model-shard1

# Move files to appropriate directories
mv face_landmark_68_model-* face_landmark_68/
mv tiny_face_detector_model-* tiny_face_detector/
