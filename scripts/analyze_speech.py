"""Local Silero VAD + WhisperX forced alignment. JSON in/out; diagnostics on stderr."""
import contextlib
import json
import sys


import math


def alignment_chunks(words, duration, max_window=5.0, padding=0.0):
    """Use disjoint seed-bounded windows. No cross-window context is mixed
    into the returned timeline. Padding is deliberately not used here.
    """
    if not ordered_intervals(words, duration):
        raise ValueError("Seed words must be finite, ordered and bounded")
    group=[]
    for word in words:
        if group and (word['end']-group[0]['start']>max_window or word['start']-group[-1]['end']>1):
            yield group,_segment(group,duration,max_window,padding)
            group=[]
        group.append(word)
    if group:yield group,_segment(group,duration,max_window,padding)


def _segment(group,duration,max_window,padding=0):
    start,end=group[0]['start'],group[-1]['end']
    if not 0<=start<end<=duration or end-start>max_window+1e-8:return None
    return {'start':start,'end':end,'text':' '.join(w['word'] for w in group)}


def ordered_intervals(words,duration):
    last=0.0
    for w in words:
        a,b=w.get('start'),w.get('end')
        if not all(isinstance(t,(float,int)) and not isinstance(t,bool) and math.isfinite(t) for t in (a,b)) or not last<=a<b<=duration:
            return False
        last=b
    return True


def interpolate_unaligned(words,group,segment,duration):
    """Keep acoustic anchors unchanged; estimated words occupy only gaps.
    Unknown words remain aligned=False. This repairs ordering, not accuracy.
    Never silently drop/revert a valid acoustic anchor to rough seed timing.
    """
    anchors=[(i,w) for i,w in enumerate(words) if w['aligned']]
    if not ordered_intervals([w for _,w in anchors],duration):
        raise ValueError("Acoustic anchors conflict within a disjoint window")
    result=[dict(w) for w in words]
    bounds=[(-1,{'end':segment['start']})]+anchors+[(len(words),{'start':segment['end']})]
    for (left,a),(right,b) in zip(bounds,bounds[1:]):
        if right==left+1:continue
        lo,hi=a['end'],b['start']
        if hi<=lo:raise ValueError("No positive interval for unaligned token run")
        weights=[group[i]['end']-group[i]['start'] for i in range(left+1,right)]
        total=sum(weights);cursor=lo
        for i,weight in zip(range(left+1,right),weights):
            end=hi if i==right-1 else cursor+(hi-lo)*weight/total
            result[i]={**result[i],'start':cursor,'end':end,'aligned':False}
            cursor=end
    if not ordered_intervals(result,duration):raise ValueError("Invalid reconciled word timeline")
    return result


def preprocess_waveform(waveform, extractor):
    """Apply the selected HF model's own input configuration per actual segment."""
    return extractor(waveform.cpu().numpy(), sampling_rate=16000,
                     return_tensors='pt').input_values.to(waveform.device)


def valid_alignment(candidate, duration, segment=None):
    start, end = candidate.get('start'), candidate.get('end')
    return (isinstance(start, (float, int)) and isinstance(end, (float, int))
            and math.isfinite(start) and math.isfinite(end)
            and 0 <= start < end <= duration
            and (segment is None or segment['start'] <= start < end <= segment['end'])
            and candidate.get('score', 0) >= 0.1)



def analyze(request):
    import numpy as np
    import torch
    from silero_vad import load_silero_vad, get_speech_timestamps
    from whisperx.audio import load_audio
    from whisperx.alignment import load_align_model, align

    torch.set_num_threads(4)
    audio = load_audio(request["audioPath"])
    if not len(audio) or not np.isfinite(audio).all():
        raise ValueError("Audio is empty or invalid")
    duration = len(audio) / 16000
    print("Detecting speech with Silero VAD", file=sys.stderr, flush=True)
    speech = get_speech_timestamps(
        torch.from_numpy(audio), load_silero_vad(onnx=True), sampling_rate=16000,
        threshold=0.4, min_speech_duration_ms=100, min_silence_duration_ms=200,
        speech_pad_ms=80, return_seconds=False,
    )
    speech = [{"start": s["start"] / 16000, "end": s["end"] / 16000} for s in speech]
    words = request.get("words", [])
    result_words = []
    aligned_count = 0
    if words:
        language = request.get("language", "he")
        print(f"Loading {language} phoneme alignment model", file=sys.stderr, flush=True)
        model, metadata = load_align_model(language, "cpu")
        if metadata.get("type") == "huggingface":
            # WhisperX invokes HF models directly, skipping their feature extractor.
            # Respect the model's own per-segment normalization configuration.
            from transformers import AutoFeatureExtractor
            extractor = AutoFeatureExtractor.from_pretrained(model.config._name_or_path)
            class PreprocessedAlignModel(torch.nn.Module):
                def __init__(self, wrapped, feature_extractor):
                    super().__init__()
                    self.wrapped = wrapped
                    self.feature_extractor = feature_extractor
                def forward(self, waveform):
                    values = preprocess_waveform(waveform, self.feature_extractor)
                    return self.wrapped(values)
            model = PreprocessedAlignModel(model, extractor)
        for group, segment in alignment_chunks(words, duration):
            if segment is None:
                result_words.extend({**word, "aligned": False} for word in group)
                continue
            print(f"Aligning {segment['start']:.1f}-{segment['end']:.1f}s", file=sys.stderr, flush=True)
            result = align([segment], model, metadata, audio, "cpu", interpolate_method="ignore")
            mapped = result["word_segments"]
            same_words = len(mapped) == len(group) and all(
                a["word"].strip() == b["word"].strip() for a, b in zip(group, mapped)
            )
            window_words = []
            for index, original in enumerate(group):
                candidate = mapped[index] if same_words else {}
                start, end = candidate.get("start"), candidate.get("end")
                valid = valid_alignment(candidate, duration, segment)
                if valid:
                    window_words.append({"word": original["word"], "start": start, "end": end, "aligned": True})
                    aligned_count += 1
                else:
                    # Unalignable tokens (e.g. numbers) are explicitly marked, never presented as precise.
                    window_words.append({**original, "aligned": False})
            result_words.extend(interpolate_unaligned(window_words, group, segment, duration))
    return {"version": 1, "duration": duration, "speech": speech, "words": result_words,
            "alignedCount": aligned_count, "totalWords": len(words),
            "vadModel": "silero-vad-6.2.0", "alignmentModel": "whisperx-3.7.4"}


if __name__ == "__main__":
    try:
        request = json.load(sys.stdin)
        with contextlib.redirect_stdout(sys.stderr):
            result = analyze(request)
        json.dump(result, sys.stdout, ensure_ascii=False, allow_nan=False)
    except Exception as error:
        print(f"Speech analysis failed: {type(error).__name__}: {error}", file=sys.stderr)
        sys.exit(1)
