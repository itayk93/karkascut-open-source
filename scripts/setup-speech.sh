#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
uv venv --python 3.11 .venv-speech
uv pip install --python .venv-speech/bin/python -r scripts/speech-requirements.txt
.venv-speech/bin/python -c 'from silero_vad import load_silero_vad; from whisperx.alignment import load_align_model; load_silero_vad(onnx=True); load_align_model("he", "cpu")'
