import os
os.environ['OMP_NUM_THREADS'] = '2'
import sys
import io
import gc
import json
import re
import tempfile
import subprocess
import shutil
import platform
import importlib.util
import torch
torch.set_num_threads(2)
import torchaudio
import numpy as np
import soundfile as sf
import warnings
try:
    from scipy.signal import fftconvolve
    HAS_SCIPY_SIGNAL = True
except Exception:
    fftconvolve = None
    HAS_SCIPY_SIGNAL = False
from flask import Flask, request, send_file, jsonify
import threading
from silero_text_prep import normalize_text
import tts_dict_loader

warnings.filterwarnings("ignore", category=SyntaxWarning)

def get_ffmpeg_bin():
    env_path = os.environ.get('ARC_FFMPEG_PATH', '').strip()
    if env_path and os.path.isfile(env_path):
        return env_path
    which_bin = shutil.which('ffmpeg')
    if which_bin:
        return which_bin
    return None

app = Flask(__name__)

# Preload model
print("Loading Silero v5.6...", flush=True)

script_dir = os.path.dirname(os.path.abspath(__file__))
appdata_dir = os.environ.get('APPDATA', '')
localappdata_dir = os.environ.get('LOCALAPPDATA', '')

# Automatic cleanup: purge legacy v5.5 models if present
legacy_v55_paths = [
    os.path.join(script_dir, 'resources', 'models', 'silero-v5', 'v5_5_ru.pt'),
    os.path.join(script_dir, 'models', 'silero-v5', 'v5_5_ru.pt'),
    os.path.join(script_dir, 'data', 'models', 'silero-v5', 'v5_5_ru.pt'),
    os.path.join(script_dir, 'data', 'v5_5_ru.pt'),
    os.path.abspath(os.path.join(script_dir, '..', 'models', 'silero-v5', 'v5_5_ru.pt')),
    os.path.join(os.path.dirname(script_dir), 'models', 'silero-v5', 'v5_5_ru.pt'),
    os.path.join(script_dir, 'v5_5_ru.pt'),
    'v5_5_ru.pt',
    os.path.expanduser('~/.cache/torch/hub/snakers4_silero-models_master/v5_5_ru.pt'),
    os.path.expanduser('~/.cache/torch/hub/checkpoints/v5_5_ru.pt'),
    os.path.join(script_dir, 'Voice', 'models', 'v5_5_ru.pt'),
    os.path.join(appdata_dir, 'a.r.c.', 'models', 'silero-v5', 'v5_5_ru.pt') if appdata_dir else None,
    os.path.join(appdata_dir, 'A.R.C.', 'models', 'silero-v5', 'v5_5_ru.pt') if appdata_dir else None,
    os.path.join(appdata_dir, 'Electron', 'models', 'silero-v5', 'v5_5_ru.pt') if appdata_dir else None,
    os.path.join(localappdata_dir, 'ARC_Voice', 'models', 'silero-v5', 'v5_5_ru.pt') if localappdata_dir else None
]
for old_p in legacy_v55_paths:
    if old_p and os.path.exists(old_p):
        try:
            os.remove(old_p)
            print(f"[Silero] Removed legacy model file: {old_p}", flush=True)
        except Exception as del_err:
            print(f"[Silero] Could not remove legacy file {old_p}: {del_err}", flush=True)

candidate_model_paths = [
    os.environ.get('ARC_SILERO_MODEL_PATH'),
    os.path.join(script_dir, 'resources', 'models', 'silero-v5', 'v5_6_ru.pt'),
    os.path.join(script_dir, 'models', 'silero-v5', 'v5_6_ru.pt'),
    os.path.join(script_dir, 'data', 'models', 'silero-v5', 'v5_6_ru.pt'),
    os.path.join(script_dir, 'data', 'v5_6_ru.pt'),
    os.path.abspath(os.path.join(script_dir, '..', 'models', 'silero-v5', 'v5_6_ru.pt')),
    os.path.join(os.path.dirname(script_dir), 'models', 'silero-v5', 'v5_6_ru.pt'),
    os.path.join(script_dir, 'v5_6_ru.pt'),
    'v5_6_ru.pt',
    os.path.expanduser('~/.cache/torch/hub/snakers4_silero-models_master/v5_6_ru.pt'),
    os.path.expanduser('~/.cache/torch/hub/checkpoints/v5_6_ru.pt'),
    os.path.join(script_dir, 'Voice', 'models', 'v5_6_ru.pt'),
    os.path.join(appdata_dir, 'a.r.c.', 'models', 'silero-v5', 'v5_6_ru.pt') if appdata_dir else None,
    os.path.join(appdata_dir, 'A.R.C.', 'models', 'silero-v5', 'v5_6_ru.pt') if appdata_dir else None,
    os.path.join(appdata_dir, 'Electron', 'models', 'silero-v5', 'v5_6_ru.pt') if appdata_dir else None,
    os.path.join(localappdata_dir, 'ARC_Voice', 'models', 'silero-v5', 'v5_6_ru.pt') if localappdata_dir else None
]

model_path = None
for p in candidate_model_paths:
    if p and os.path.exists(p) and os.path.getsize(p) > 10 * 1024 * 1024:
        model_path = p
        print(f"[Silero] Found existing model at: {model_path} ({os.path.getsize(p)} bytes)", flush=True)
        break

if not model_path:
    checked_paths = ", ".join([str(p) for p in candidate_model_paths if p])
    err_msg = (
        f"[Silero] ERROR: Model file 'v5_6_ru.pt' not found in candidate paths: [{checked_paths}]. "
        f"Returning HTTP 503 for TTSService fallback."
    )
    print(err_msg, file=sys.stderr, flush=True)
    print(err_msg, flush=True)
    if 'torch' not in sys.modules:
        sys.exit(1)

device = torch.device('cpu')
model = None
_model_load_lock = threading.Lock()

def try_load_model():
    global model, model_path
    if model is not None:
        return True
    with _model_load_lock:
        if model is not None:
            return True
        if not model_path or not os.path.exists(model_path) or os.path.getsize(model_path) <= 10 * 1024 * 1024:
            model_path = None
            for p in candidate_model_paths:
                if p and os.path.exists(p) and os.path.getsize(p) > 10 * 1024 * 1024:
                    model_path = p
                    print(f"[Silero] Found existing model at: {model_path} ({os.path.getsize(p)} bytes)", flush=True)
                    break
        if not model_path:
            return False
        try:
            loaded = torch.package.PackageImporter(model_path).load_pickle("tts_models", "model")
            loaded.to(device)
            model = loaded
            print(f"Silero v5.6 loaded successfully from {model_path}.", flush=True)
            return True
        except Exception as load_err:
            print(f"[Silero] ERROR loading model from {model_path}: {load_err}", file=sys.stderr, flush=True)
            model = None
            return False

if model_path:
    try_load_model()

sample_rate = 48000
_synth_phrase_count = 0
_synth_lock = threading.Lock()

# Generate micro-room studio IR for tight, dry, full-bodied vocal presence
def make_ir(sr=48000, seconds=0.12):
    n = int(sr * seconds)
    rng = np.random.default_rng(7)
    t = np.arange(n) / sr
    ir = np.zeros(n)
    ir[int(0.005 * sr)] = 0.20
    ir[int(0.012 * sr)] = 0.12
    ir += rng.standard_normal(n) * np.exp(-t / 0.02) * 0.10
    fade = np.clip((seconds - t) / 0.02, 0.0, 1.0)
    ir *= fade
    ir /= np.max(np.abs(ir))
    return ir

IR = make_ir(sample_rate, 0.12)

def reverb_mix(dry, ir, wet=0.02):
    if not HAS_SCIPY_SIGNAL or fftconvolve is None:
        return dry
    rev = fftconvolve(dry, ir, mode="full")
    dry_rms = np.sqrt(np.mean(dry**2))
    rev_rms = np.sqrt(np.mean(rev**2))
    if rev_rms > 1e-10:
        rev = rev * (dry_rms / rev_rms) * wet
    else:
        rev = np.zeros_like(rev)
    out = np.pad(dry, (0, len(rev) - len(dry))) + rev
    max_val = np.max(np.abs(out))
    if max_val > 0.95:
        out *= 0.95 / max_val
    return out

ruaccent_instance = None
_ruaccent_init_attempted = False
_ruaccent_init_in_progress = False
_ruaccent_last_error = None
_ruaccent_ready_event = threading.Event()
_ruaccent_lock = threading.Lock()

def _load_ruaccent_instance(accentizer, workdir):
    if not hasattr(accentizer, "load"):
        return
    try:
        accentizer.load(omograph_model_size="small", use_cuda=False, workdir=workdir)
    except TypeError:
        accentizer.load(omograph_model_size="small", use_cuda=False)

def _init_ruaccent_worker():
    global ruaccent_instance, _ruaccent_init_attempted, _ruaccent_init_in_progress, _ruaccent_last_error
    try:
        import ruaccent
        import onnxruntime as ort
        from onnxruntime.quantization import quantize_dynamic, QuantType

        ruaccent_dir = os.environ.get("ARC_RUACCENT_DIR", "").strip()
        if not ruaccent_dir:
            ruaccent_dir = os.path.join(script_dir, "models", "ruaccent")
        os.makedirs(ruaccent_dir, exist_ok=True)

        int8_marker = os.path.join(ruaccent_dir, ".int8_ready")
        try:
            accentizer = ruaccent.RUAccent()
            # 1. Загружаем (при первом запуске ruaccent скачает веса в ruaccent_dir)
            _load_ruaccent_instance(accentizer, ruaccent_dir)

            # 2. Если модели ещё не квантованы в INT8, квантуем in-place с сохранением штатных имён *.onnx
            if not os.path.exists(int8_marker):
                quantized_any = False
                for root, _, files in os.walk(ruaccent_dir):
                    for file in files:
                        if file.endswith(".onnx") and not file.endswith(".int8.tmp"):
                            fp32_path = os.path.join(root, file)
                            tmp_int8_path = fp32_path + ".int8.tmp"
                            try:
                                print(f"[RUAccent] Quantizing {file} to INT8 in-place...", flush=True)
                                quantize_dynamic(fp32_path, tmp_int8_path, weight_type=QuantType.QUInt8)
                                if os.path.exists(tmp_int8_path) and os.path.getsize(tmp_int8_path) > 1024:
                                    os.replace(tmp_int8_path, fp32_path)
                                    quantized_any = True
                            except Exception as q_err:
                                print(f"[WARN] RUAccent quantization error for {file}: {q_err}", flush=True)
                                if os.path.exists(tmp_int8_path):
                                    try:
                                        os.remove(tmp_int8_path)
                                    except:
                                        pass
                if quantized_any:
                    try:
                        with open(int8_marker, "w", encoding="utf-8") as mf:
                            mf.write("int8")
                    except:
                        pass
                    accentizer = ruaccent.RUAccent()
                    _load_ruaccent_instance(accentizer, ruaccent_dir)
                    gc.collect()

            ruaccent_instance = accentizer
            _ruaccent_last_error = None
            print("RUAccent loaded (int8)", flush=True)
        except Exception as load_err:
            _ruaccent_last_error = str(load_err)
            print(f"[RUAccent] Initialization error/fallback: {load_err}", file=sys.stderr, flush=True)
            print(f"[RUAccent] Initialization info/fallback: {load_err}", flush=True)
            ruaccent_instance = None
    except Exception as import_err:
        _ruaccent_last_error = str(import_err)
        print(f"[RUAccent] Module not available ({import_err}), using built-in dictionaries", flush=True)
        ruaccent_instance = None
    finally:
        _ruaccent_init_attempted = True
        _ruaccent_init_in_progress = False
        _ruaccent_ready_event.set()

def start_ruaccent_preload():
    global _ruaccent_init_in_progress
    if _ruaccent_init_attempted or _ruaccent_ready_event.is_set():
        return
    with _ruaccent_lock:
        if _ruaccent_init_attempted or _ruaccent_init_in_progress or _ruaccent_ready_event.is_set():
            return
        _ruaccent_init_in_progress = True
        threading.Thread(target=_init_ruaccent_worker, name="ruaccent-preload", daemon=True).start()

@app.before_request
def _ensure_ruaccent_preload_before_first_request():
    if not _ruaccent_init_attempted and not _ruaccent_init_in_progress:
        start_ruaccent_preload()

def get_ruaccent(timeout=5.0):
    global ruaccent_instance, _ruaccent_init_attempted
    if _ruaccent_init_attempted:
        return ruaccent_instance
    start_ruaccent_preload()
    ready = _ruaccent_ready_event.wait(timeout=timeout)
    if not ready:
        print(f"[RUAccent] Initialization timed out after {timeout}s; returning None without blocking Flask.", file=sys.stderr, flush=True)
        print(f"[RUAccent] Initialization timed out after {timeout}s; returning None without blocking Flask.", flush=True)
        return None
    return ruaccent_instance

@app.route('/presets', methods=['GET'])
def presets():
    return {
        "presets": [
            {"id": "eugene", "name": "Silero v5.6 — Евгений (eugene)"},
            {"id": "aidar", "name": "Silero v5.6 — Айдар (aidar)"},
            {"id": "baya", "name": "Silero v5.6 — Байя (baya)"},
            {"id": "kseniya", "name": "Silero v5.6 — Ксения (kseniya)"},
            {"id": "xenia", "name": "Silero v5.6 — Ксения 2 (xenia)"}
        ]
    }

CACHE_DIR = os.environ.get("ARC_TTS_CACHE_DIR", "").strip() or "tts_cache"
os.makedirs(CACHE_DIR, exist_ok=True)

@app.route("/cache-stats", methods=["GET"])
def cache_stats():
    entries = 0
    size_bytes = 0
    if os.path.exists(CACHE_DIR):
        for root, dirs, files in os.walk(CACHE_DIR):
            for file in files:
                entries += 1
                try:
                    size_bytes += os.path.getsize(os.path.join(root, file))
                except:
                    pass
    return {"entries": entries, "sizeBytes": size_bytes, "hits": 0, "misses": 0, "evictions": 0}

def _purge_cache_files(files_to_remove):
    for f in files_to_remove:
        try:
            os.remove(os.path.join(CACHE_DIR, f))
        except:
            pass
    print("[INFO] Python Cache cleared", flush=True)

@app.route("/clear-cache", methods=["POST"])
def clear_cache():
    files_to_remove = os.listdir(CACHE_DIR) if os.path.exists(CACHE_DIR) else []
    threading.Thread(target=_purge_cache_files, args=(files_to_remove,), daemon=True).start()
    return {"success": True}

def get_runtime_capabilities():
    ffmpeg_ready = bool(get_ffmpeg_bin())
    scipy_ready = bool(HAS_SCIPY_SIGNAL)
    ruaccent_spec = importlib.util.find_spec("ruaccent") is not None
    ort_spec = importlib.util.find_spec("onnxruntime") is not None
    accent_ready = bool(ruaccent_spec and ort_spec and (_ruaccent_last_error is None))
    dsp_ready = bool(ffmpeg_ready and scipy_ready)
    state = "READY" if (accent_ready and dsp_ready) else "DEGRADED"
    errors = []
    if not ffmpeg_ready:
        errors.append("ffmpeg_unavailable")
    if not scipy_ready:
        errors.append("scipy_unavailable")
    if not accent_ready:
        errors.append(_ruaccent_last_error or "ruaccent_or_onnxruntime_unavailable")
    return {
        "state": state,
        "coreReady": True,
        "dspReady": dsp_ready,
        "accentReady": accent_ready,
        "ffmpegReady": ffmpeg_ready,
        "scipyReady": scipy_ready,
        "ruaccentLoaded": ruaccent_instance is not None,
        "onnxruntimeAvailable": ort_spec,
        "ruaccentAvailable": ruaccent_spec,
        "pythonVersion": f"{sys.version_info[0]}.{sys.version_info[1]}.{sys.version_info[2]}",
        "arch": platform.machine(),
        "errors": errors,
    }


@app.route("/status", methods=["GET"])
def status():
    dict_diag = tts_dict_loader.get_diagnostics()
    pronunciation_state = dict_diag.get("state", "ERROR")
    deps_diag = get_runtime_capabilities()
    if model is None and not try_load_model():
        return {
            "status": "degraded",
            "error": "model_not_found",
            "model": "silero_v5_6_ru",
            "pronunciationState": pronunciation_state,
            "dictionaries": dict_diag,
            "dependencies": deps_diag,
        }, 503
    return {
        "status": "online",
        "model": "silero_v5_6_ru",
        "pronunciationState": pronunciation_state,
        "dictionaries": dict_diag,
        "dependencies": deps_diag,
    }

@app.route('/tts_stream', methods=['POST'])
def tts_stream():
    if model is None and not try_load_model():
        return jsonify({"error": "Silero model v5_6_ru.pt not found"}), 503
    data = request.json
    text = data.get('text', '')
    if not text:
        return {"error": "No text provided"}, 400
        
    text = normalize_text(text)

    speaker_id = data.get('speaker', 'eugene')
    if speaker_id == 'eugen':
        speaker_id = 'eugene'
        
    req_sample_rate = data.get('sample_rate', sample_rate)
    req_put_accent = data.get('put_accent', True)
    req_put_yo = data.get('put_yo', True)
    base_speed = float(data.get('speed', 1.0))

    accentizer = get_ruaccent()
    if accentizer is not None:
        try:
            if hasattr(accentizer, "process_all"):
                text = accentizer.process_all(text)
            elif hasattr(accentizer, "process"):
                text = accentizer.process(text)
            req_put_accent = False
            req_put_yo = False
        except Exception as acc_err:
            print(f"[WARN] RUAccent stream processing error: {acc_err}", flush=True)
    
    text_len = len(text)
    print(f"[DSP v2] Processing TTS for text length {text_len} (put_accent={req_put_accent}, put_yo={req_put_yo})", flush=True)
    final_speed = base_speed

    def generate_chunks():
        global _synth_phrase_count
        # Sentence chunking for Streaming Pseudo-SSML
        # Split by major punctuation, keeping the delimiter
        parts = re.split(r'(\.\.\.|[:.,?!;\n—]+)', text)
        sentences = []
        for i in range(0, len(parts)-1, 2):
            sentences.append((parts[i].strip(), parts[i+1].strip()))
        if len(parts) % 2 != 0 and parts[-1].strip():
            sentences.append((parts[-1].strip(), ""))

        for sentence, punct in sentences:
            chunk_text = sentence + punct
            if not chunk_text.strip() or not re.search(r'[А-Яа-яA-Za-zЁё]', chunk_text):
                continue
                
            try:
                with torch.inference_mode():
                    audio_tensor = model.apply_tts(
                        text=chunk_text, 
                        speaker=speaker_id, 
                        sample_rate=req_sample_rate, 
                        put_accent=req_put_accent, 
                        put_yo=req_put_yo
                    )
                    audio_np = audio_tensor.numpy()
                yield audio_np.tobytes()

                # Pseudo-SSML: Dynamic breath/pause based on punctuation
                pause_ms = 0
                if '...' in punct:
                    pause_ms = 600
                elif '\n' in punct:
                    pause_ms = 500
                elif ':' in punct:
                    pause_ms = 350  # Distinct colon pause ~350ms
                elif '.' in punct or '!' in punct or '?' in punct:
                    pause_ms = 350
                elif ';' in punct or '—' in punct:
                    pause_ms = 200
                elif ',' in punct:
                    pause_ms = 150
                    
                if pause_ms > 0:
                    silence = np.zeros(int(req_sample_rate * (pause_ms / 1000.0)), dtype=np.float32)
                    yield silence.tobytes()

            except Exception as e:
                print(f"[WARN] TTS generation failed for chunk '{chunk_text}': {e}", flush=True)
                continue
        with _synth_lock:
            _synth_phrase_count += 1
            if _synth_phrase_count % 20 == 0:
                gc.collect(0)

    return app.response_class(generate_chunks(), mimetype='application/octet-stream')

@app.route('/tts', methods=['POST'])
def tts_endpoint():
    global _synth_phrase_count
    if model is None and not try_load_model():
        return jsonify({"error": "Silero model v5_6_ru.pt not found"}), 503
    data = request.json or {}
    text = data.get('text', '')
    if not text:
        return {"error": "No text provided"}, 400

    try:
        text = normalize_text(text)
        speaker_id = data.get('speaker', 'eugene')
        if speaker_id == 'eugen':
            speaker_id = 'eugene'
        
        req_sample_rate = data.get('sample_rate', sample_rate)
        req_put_accent = data.get('put_accent', True)
        req_put_yo = data.get('put_yo', True)
        base_speed = float(data.get('speed', 1.0))
        
        accentizer = get_ruaccent()
        if accentizer is not None:
            try:
                if hasattr(accentizer, "process_all"):
                    text = accentizer.process_all(text)
                elif hasattr(accentizer, "process"):
                    text = accentizer.process(text)
                req_put_accent = False
                req_put_yo = False
            except Exception as acc_err:
                print(f"[WARN] RUAccent processing error: {acc_err}", flush=True)

        text_len = len(text)
        print(f"[DSP v2] Processing TTS for text length {text_len} (put_accent={req_put_accent}, put_yo={req_put_yo})", flush=True)
        final_speed = base_speed

        audio_chunks = []
        # Support for ... (ellipsis) and basic punctuation
        parts = re.split(r'(\.\.\.|[:.,?!;\n—]+)', text)
        sentences = []
        for i in range(0, len(parts)-1, 2):
            sentences.append((parts[i].strip(), parts[i+1].strip()))
        if len(parts) % 2 != 0 and parts[-1].strip():
            sentences.append((parts[-1].strip(), ""))

        with torch.inference_mode():
            for sentence, punct in sentences:
                chunk_text = sentence + punct
                if not chunk_text.strip() or not re.search(r'[А-Яа-яЁё]', chunk_text):
                    continue

                try:
                    chunk_tensor = model.apply_tts(
                        text=chunk_text,
                        speaker=speaker_id,
                        sample_rate=req_sample_rate,
                        put_accent=req_put_accent,
                        put_yo=req_put_yo
                    )
                except Exception as chunk_err:
                    print(f"[WARN] apply_tts failed on chunk '{chunk_text}' ({chunk_err}), retrying plain Cyrillic...", flush=True)
                    plain_chunk = re.sub(r'[^А-Яа-яЁё\s.,?!;:\-]', ' ', chunk_text.replace('+', '')).strip()
                    if not plain_chunk or not re.search(r'[А-Яа-яЁё]', plain_chunk):
                        continue
                    try:
                        chunk_tensor = model.apply_tts(
                            text=plain_chunk,
                            speaker=speaker_id,
                            sample_rate=req_sample_rate,
                            put_accent=False,
                            put_yo=req_put_yo
                        )
                    except Exception as retry_err:
                        print(f"[WARN] Retry apply_tts also failed for '{plain_chunk}': {retry_err}", flush=True)
                        continue
                audio_chunks.append(chunk_tensor.numpy())
                
                # Pauses
                pause_ms = 0
                if '...' in punct:
                    pause_ms = 600
                elif '\n' in punct:
                    pause_ms = 800 # Paragraph
                elif ':' in punct:
                    pause_ms = 350 # Distinct colon pause ~350-400ms
                elif '.' in punct or '!' in punct or '?' in punct:
                    pause_ms = 400 # Between sentences
                elif ';' in punct or '—' in punct:
                    pause_ms = 250
                elif ',' in punct:
                    pause_ms = 150
                    
                if pause_ms > 0:
                    silence = np.zeros(int(req_sample_rate * (pause_ms / 1000.0)), dtype=np.float32)
                    audio_chunks.append(silence)

        with _synth_lock:
            _synth_phrase_count += 1
            if _synth_phrase_count % 20 == 0:
                gc.collect(0)

        if not audio_chunks:
            return {"error": "No valid text to synthesize"}, 400
            
        audio_np = np.concatenate(audio_chunks)

        with tempfile.TemporaryDirectory() as tmpdir:
            raw_path = os.path.join(tmpdir, "raw.wav")
            sf.write(raw_path, audio_np, req_sample_rate)

            ffmpeg_bin = get_ffmpeg_bin()
            if not ffmpeg_bin:
                fallback_path = os.path.join(tmpdir, "fallback.wav")
                sf.write(fallback_path, audio_np, req_sample_rate, subtype='PCM_16')
                with open(fallback_path, 'rb') as f:
                    data = f.read()
                response = send_file(io.BytesIO(data), mimetype='audio/wav')
                response.headers['X-DSP-Error'] = 'ffmpeg_unavailable'
                return response

            try:
                p1_path = os.path.join(tmpdir, "p1.wav")
                p2_path = os.path.join(tmpdir, "p2.wav")
                comp_path = os.path.join(tmpdir, "comp.wav")
                final_path = os.path.join(tmpdir, "final.wav")

                req_pitch = float(data.get('pitch', 0))
                
                # pitch_shift maps from -20 to 20 %
                pitch_val = 1.0 + (req_pitch / 100.0)

                # Priorities 1-2 (ffmpeg): High-pass, chest warmth, presence, de-esser
                filter_parts = []
                if abs(pitch_val - 1.0) > 0.005:
                    filter_parts.append(f"asetrate={int(req_sample_rate*pitch_val)},aresample={req_sample_rate},atempo={1.0/pitch_val:.4f}")
                if abs(final_speed - 1.0) > 0.005:
                    filter_parts.append(f"atempo={final_speed:.4f}")
                
                filter_parts.extend([
                    "highpass=f=60",
                    "equalizer=f=110:t=q:w=0.8:g=3.0",
                    "equalizer=f=350:t=q:w=1.0:g=-1.5",
                    "equalizer=f=2800:t=q:w=0.9:g=2.2",
                    "deesser=i=0.4:m=0.8",
                    "treble=g=-1:f=11000"
                ])
                filter_str = ",".join(filter_parts)

                subprocess.run([
                    ffmpeg_bin, "-y", "-i", raw_path, 
                    "-af", filter_str, p1_path
                ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

                # Priority 4: Reverb (numpy) - Ultra-subtle micro-room studio wetness (2%)
                y, sr = sf.read(p1_path)
                if len(y.shape) > 1: y = y.mean(axis=1)
                y_wet = reverb_mix(y, IR, wet=0.02)
                sf.write(p2_path, y_wet, sr)

                # Priority 3: Broadcast Glue Compression (ffmpeg) - tight, dense, forward vocal
                comp_filter = "acompressor=threshold=-24dB:ratio=3.2:attack=6:release=120:makeup=2.0"
                subprocess.run([
                    ffmpeg_bin, "-y", "-i", p2_path,
                    "-af", comp_filter, comp_path
                ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

                # Measure LUFS
                result = subprocess.run([
                    ffmpeg_bin, "-i", comp_path,
                    "-af", "loudnorm=print_format=json",
                    "-f", "null", "-"
                ], stderr=subprocess.PIPE, text=True)

                match = re.search(r'\{\s*"input_i".*?\}', result.stderr, re.DOTALL)
                gain = 0.0
                if match:
                    loudnorm_data = json.loads(match.group(0))
                    input_i = float(loudnorm_data['input_i'])
                    gain = -16.0 - input_i

                final_filter = f"volume={gain}dB,alimiter=limit=0.95:level=false:attack=5:release=100"
                subprocess.run([
                    ffmpeg_bin, "-y", "-i", comp_path,
                    "-af", final_filter, final_path
                ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

                with open(final_path, 'rb') as f:
                    data = f.read()
            except Exception as dsp_err:
                print(f"[WARN] DSP pipeline processing failed ({dsp_err}). Returning raw Silero audio.", flush=True)
                fallback_path = os.path.join(tmpdir, "fallback.wav")
                sf.write(fallback_path, audio_np, req_sample_rate, subtype='PCM_16')
                with open(fallback_path, 'rb') as f:
                    data = f.read()
                
                response = send_file(io.BytesIO(data), mimetype='audio/wav')
                response.headers['X-DSP-Error'] = str(dsp_err).replace('\n', ' ')
                return response


        return send_file(io.BytesIO(data), mimetype='audio/wav')
    except Exception as e:
        import traceback
        traceback.print_exc()
        return {"error": str(e)}, 500


@app.route('/reload_dicts', methods=['POST'])
def reload_dicts():
    try:
        diag = tts_dict_loader.reload()
        state = diag.get("state", "ERROR")
        status_str = "error" if state == "ERROR" else ("degraded" if state == "DEGRADED" else "ok")
        http_code = 500 if state == "ERROR" else 200
        return jsonify({
            "status": status_str,
            "pronunciationState": state,
            "dictionaries": diag,
            "message": "Dictionaries reloaded"
        }), http_code
    except Exception as e:
        return jsonify({
            "status": "error",
            "pronunciationState": "ERROR",
            "error": str(e)
        }), 500

if __name__ == '__main__':
    print(f"[SILERO SERVER BUILD: 2026-09-08 22:00:00]", flush=True)
    print("Server starting...", flush=True)

    def self_test_normalization():
        diag = tts_dict_loader.get_diagnostics()
        count = len(tts_dict_loader.get_it_dict_compiled())
        print(
            f"[DictLoader] State={diag.get('state')} Loaded {count} IT entries "
            f"(bundledDir={diag.get('bundledDir')}, userDir={diag.get('userDir')}, overrides={diag.get('userOverrideCounts', {}).get('totalOverrides', 0)})",
            flush=True,
        )
        tests = {
            "PayPal": "пэйпэл",
            "Tesla": "тесла",
            "server": "сервер",
            "Jenkins": "дженкинс",
            "webpack": "вебпак",
            "example dot com": "экзампл точка ком",
            "main.py": "мэйн точка пай",
            "версия 2.5": "версия два точка пять",
            "здорово": "здор+ово"
        }
        for word, expected in tests.items():
            res = normalize_text(word).strip()
            if res != expected:
                print(f"[DictLoader-Test] FAILED: {word} -> '{res}' (expected '{expected}')", flush=True)
            else:
                print(f"[DictLoader-Test] OK: {word} -> {res}", flush=True)

    def self_test_dsp():
        ffmpeg_bin = get_ffmpeg_bin()
        if not ffmpeg_bin:
            print("[DSP v2] ffmpeg not found; DSP disabled (raw WAV mode)", flush=True)
            return
        try:
            with tempfile.TemporaryDirectory() as tmpdir:
                raw_path = os.path.join(tmpdir, "test_raw.wav")
                out_path = os.path.join(tmpdir, "test_out.wav")

                sr = 24000
                silence = np.zeros(sr, dtype=np.float32)
                sf.write(raw_path, silence, sr)

                subprocess.run([
                    ffmpeg_bin, "-y", "-i", raw_path,
                    "-af", "highpass=f=60", out_path
                ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

                print("[DSP v2] selftest OK", flush=True)
        except Exception as e:
            print(f"[DSP v2] selftest FAILED: {e}", flush=True)

    self_test_normalization()
    self_test_dsp()
    start_ruaccent_preload()

    app.run(host='127.0.0.1', port=8002, threaded=True)
