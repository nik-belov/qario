import os
import sys
import time
import argparse
from typing import List
import numpy as np
from moviepy.editor import VideoFileClip
import librosa
import matplotlib.pyplot as plt



left = VideoFileClip("out/vvsync_left.mp4")
rght = VideoFileClip("out/vvsync_rght.mp4")

left.audio = rght.audio
left.write_videofile("out/vvsync_left2.mp4")
