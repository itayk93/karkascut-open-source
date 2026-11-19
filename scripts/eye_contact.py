#!/usr/bin/env python3
"""
Eye Contact Correction using OpenCV
Detects face and eyes using Haar Cascades, detects pupil location,
and subtly shifts/centers the gaze towards the camera lens using smooth Gaussian blending.
"""

import sys
import os
import cv2
import numpy as np

def process_eye(eye_roi):
    h, w = eye_roi.shape[:2]
    if h < 10 or w < 10:
        return eye_roi

    gray_eye = cv2.cvtColor(eye_roi, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray_eye, (7, 7), 0)
    
    min_val, max_val, min_loc, max_loc = cv2.minMaxLoc(blurred)
    pupil_x, pupil_y = min_loc

    target_x = int(w * 0.5)
    target_y = int(h * 0.45)

    shift_x = int((target_x - pupil_x) * 0.45)
    shift_y = int((target_y - pupil_y) * 0.45)

    if abs(shift_x) < 2 and abs(shift_y) < 2:
        return eye_roi

    M = np.float32([[1, 0, shift_x], [0, 1, shift_y]])
    shifted = cv2.warpAffine(eye_roi, M, (w, h), borderMode=cv2.BORDER_REFLECT)

    mask = np.zeros((h, w), dtype=np.float32)
    radius_x = int(w * 0.35)
    radius_y = int(h * 0.4)
    cv2.ellipse(mask, (pupil_x, pupil_y), (radius_x, radius_y), 0, 0, 360, 1.0, -1)
    mask = cv2.GaussianBlur(mask, (15, 15), 0)
    mask = np.repeat(mask[:, :, np.newaxis], 3, axis=2)

    blended = (shifted * mask + eye_roi * (1.0 - mask)).astype(np.uint8)
    return blended

def process_video(input_path, output_path):
    if not os.path.exists(input_path):
        print(f"Error: input file {input_path} not found", file=sys.stderr)
        sys.exit(1)

    cascade_dir = cv2.data.haarcascades
    face_cascade = cv2.CascadeClassifier(os.path.join(cascade_dir, 'haarcascade_frontalface_default.xml'))
    eye_cascade = cv2.CascadeClassifier(os.path.join(cascade_dir, 'haarcascade_eye.xml'))

    cap = cv2.VideoCapture(input_path)
    if not cap.isOpened():
        print(f"Error: could not open video {input_path}", file=sys.stderr)
        sys.exit(1)

    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

    temp_raw_video = output_path + ".raw.mp4"
    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    out = cv2.VideoWriter(temp_raw_video, fourcc, fps, (width, height))

    frame_idx = 0
    print(f"Starting Eye Contact Correction: {total_frames} frames @ {fps} fps", flush=True)

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        frame_idx += 1
        if frame_idx % 30 == 0:
            pct = int((frame_idx / max(1, total_frames)) * 100)
            print(f"PROGRESS:{pct}", flush=True)

        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        faces = face_cascade.detectMultiScale(gray, scaleFactor=1.2, minNeighbors=5, minSize=(80, 80))

        for (fx, fy, fw, fh) in faces:
            eye_region_gray = gray[fy:fy + int(fh * 0.55), fx:fx + fw]
            eye_region_color = frame[fy:fy + int(fh * 0.55), fx:fx + fw]
            eyes = eye_cascade.detectMultiScale(eye_region_gray, scaleFactor=1.15, minNeighbors=4, minSize=(25, 25))

            for (ex, ey, ew, eh) in eyes:
                eye_roi = eye_region_color[ey:ey + eh, ex:ex + ew]
                processed_eye = process_eye(eye_roi)
                eye_region_color[ey:ey + eh, ex:ex + ew] = processed_eye

        out.write(frame)

    cap.release()
    out.release()

    import subprocess
    cmd = [
        "ffmpeg", "-y",
        "-i", temp_raw_video,
        "-i", input_path,
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "18",
        "-map", "0:v:0",
        "-map", "1:a:0?",
        "-c:a", "copy",
        "-metadata:s:v:0", "rotate=0",
        output_path
    ]
    res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if os.path.exists(temp_raw_video):
        os.remove(temp_raw_video)

    if res.returncode != 0:
        print(f"FFmpeg muxing error: {res.stderr.decode('utf-8', errors='ignore')}", file=sys.stderr)
        sys.exit(res.returncode)

    print("DONE: Eye Contact Correction completed successfully!", flush=True)

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: eye_contact.py <input_video> <output_video>", file=sys.stderr)
        sys.exit(1)
    process_video(sys.argv[1], sys.argv[2])
