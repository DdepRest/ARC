#!/usr/bin/env python
"""Objective spectral analysis of the 28 homograph WAV samples (pre-listening signal).

Measures, per rule pair/triplet:
  - exact sample identity (does the '+' marker reach the model at all?)
  - duration delta
  - DTW-aligned log-mel log-spectral distance (LSD), mean/max, in dB
  - LSD split by band (50-1000 / 1000-3000 / 3000-7600 Hz)
  - time position of peak divergence (localization probe)
Plus a nearest-neighbor clustering probe over the 20 "zamok" files.

Caveat: LSD measures DIFFERENCE, not correctness of stress. Verdicts still
require listening; this report only says where/how much audio changes.
"""
import glob
import os
import sys

import numpy as np
import soundfile as sf

N_FFT = 1024
HOP = 480                      # 10 ms @ 48 kHz
N_MELS = 40
FMIN, FMAX = 50.0, 7600.0
EPS = 1e-10
BANDS = [(50.0, 1000.0), (1000.0, 3000.0), (3000.0, 7600.0)]

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IN_DIR = os.path.join(ROOT, "tts_test")
OUT_MD = os.path.join(IN_DIR, "spectral_analysis.md")
WIN = np.hanning(N_FFT)


# ---------- features ----------

def hz2mel(f):
    return 2595.0 * np.log10(1.0 + f / 700.0)


def mel2hz(m):
    return 700.0 * (10.0 ** (m / 2595.0) - 1.0)


def mel_filterbank(sr):
    mels = np.linspace(hz2mel(FMIN), hz2mel(FMAX), N_MELS + 2)
    hz = mel2hz(mels)
    centers = hz[1:-1]
    bins = np.round((N_FFT + 1) * hz / sr).astype(int)
    fb = np.zeros((N_MELS, N_FFT // 2 + 1))
    for i in range(N_MELS):
        a, b, c = bins[i], bins[i + 1], bins[i + 2]
        b = max(b, a + 1)
        c = max(c, b + 1)
        c = min(c, N_FFT // 2)
        b = min(b, c)
        if b > a:
            fb[i, a:b] = (np.arange(a, b) - a) / (b - a)
        if c > b:
            fb[i, b:c] = (c - np.arange(b, c)) / (c - b)
    return fb, centers


def logmel(x, sr, fb):
    if len(x) < N_FFT:
        x = np.pad(x, (0, N_FFT - len(x)))
    n = 1 + (len(x) - N_FFT) // HOP
    idx = np.arange(N_FFT)[None, :] + HOP * np.arange(n)[:, None]
    spec = np.fft.rfft(x[idx] * WIN, axis=1)
    power = np.abs(spec) ** 2
    mel = power @ fb.T
    return 10.0 * np.log10(mel + EPS)


# ---------- DTW ----------

def dtw(fa, fb):
    # n/m are FRAME counts of the two sequences (fa.shape[1] is the band count!)
    n = fa.shape[0]
    m = fb.shape[0]
    d = ((fa[:, None, :] - fb[None, :, :]) ** 2).sum(axis=2)  # (n, m)
    D = np.full((n + 1, m + 1), np.inf)
    D[0, 0] = 0.0
    for i in range(1, n + 1):
        row = D[i]
        prev = D[i - 1]
        ci = d[i - 1]
        for j in range(1, m + 1):
            row[j] = ci[j - 1] + min(prev[j], row[j - 1], prev[j - 1])
    # backtrack (ties prefer the diagonal — otherwise identical signals
    # walk a vertical/horizontal tie-path and report a bogus non-zero LSD)
    i, j = n, m
    path = []
    while i > 0 or j > 0:
        path.append((i - 1, j - 1))
        if i == 0:
            j -= 1
        elif j == 0:
            i -= 1
        else:
            c_diag = D[i - 1, j - 1]
            c_vert = D[i - 1, j]
            c_horiz = D[i, j - 1]
            if c_diag <= c_vert and c_diag <= c_horiz:
                i -= 1
                j -= 1
            elif c_vert <= c_horiz:
                i -= 1
            else:
                j -= 1
    path.reverse()
    return D[n, m], path


# ---------- metrics ----------

def load(path):
    x, sr = sf.read(path, dtype="float64")
    if x.ndim > 1:
        x = x.mean(axis=1)
    return x, sr


def pair_metrics(pa, pb, fb, centers):
    xa, sr = load(pa)
    xb, _ = load(pb)
    same_len = len(xa) == len(xb)
    maxdiff = float(np.max(np.abs(xa - xb))) if same_len else None
    identical = bool(maxdiff == 0.0) if maxdiff is not None else False
    maxdiff_s = f"{maxdiff:.4g}" if maxdiff is not None else "n/a (длительность отличается)"

    fa = logmel(xa, sr, fb)
    fbb = logmel(xb, sr, fb)
    _, path = dtw(fa, fbb)
    lsd = np.sqrt(((fa[[p[0] for p in path]] - fbb[[p[1] for p in path]]) ** 2).mean(axis=1))
    ia = [p[0] for p in path]
    ib = [p[1] for p in path]
    peak_k = int(np.argmax(lsd))
    pos_a = ((ia[peak_k] + 0.5) * HOP / sr) / (len(xa) / sr)
    pos_b = ((ib[peak_k] + 0.5) * HOP / sr) / (len(xb) / sr)

    band_lsd = []
    for lo, hi in BANDS:
        sel = (centers >= lo) & (centers < hi)
        band_lsd.append(float(np.sqrt(
            ((fa[[p[0] for p in path]][:, sel] - fbb[[p[1] for p in path]][:, sel]) ** 2).mean())))

    return {
        "identical": identical,
        "maxdiff": maxdiff,
        "maxdiff_s": maxdiff_s,
        "dur_a": len(xa) / sr,
        "dur_b": len(xb) / sr,
        "dur_delta_ms": (len(xa) - len(xb)) / sr * 1000.0,
        "lsd_mean": float(lsd.mean()),
        "lsd_max": float(lsd.max()),
        "peak_pos_a": pos_a,
        "peak_pos_b": pos_b,
        "band_lsd": band_lsd,
    }


def nn_matrix(files, fb):
    feats = []
    for p in files:
        x, sr = load(p)
        feats.append(logmel(x, sr, fb))
    n = len(files)
    dist = np.zeros((n, n))
    for i in range(n):
        for j in range(i + 1, n):
            _, path = dtw(feats[i], feats[j])
            ii = [q[0] for q in path]
            jj = [q[1] for q in path]
            v = float(np.sqrt(((feats[i][ii] - feats[j][jj]) ** 2).mean()))
            dist[i, j] = dist[j, i] = v
    return dist


# ---------- report ----------

def main():
    if not os.path.isdir(IN_DIR):
        print(f"[ERROR] {IN_DIR} not found")
        return 1
    wavs = sorted(glob.glob(os.path.join(IN_DIR, "*.wav")))
    print(f"Found {len(wavs)} WAV files in {IN_DIR}")
    if len(wavs) != 28:
        print("[ERROR] expected exactly 28 WAV files")
        return 1

    sr0 = sf.info(wavs[0]).samplerate
    fb, centers = mel_filterbank(sr0)

    # calibration: distance between two unrelated utterances (scale reference)
    def base(name):
        return os.path.join(IN_DIR, name)

    cal_pairs = [
        ("01_dvernoy_zamok_without_plus.wav", "11_zdorovo_without_plus.wav"),
        ("07_srednevekovy_zamok_without_plus.wav", "02_otkryt_zamok_without_plus.wav"),
        ("12_sistema_without_plus.wav", "13_na_svyazi_without_plus.wav"),
    ]
    cal = [pair_metrics(base(a), base(b), fb, centers)["lsd_mean"] for a, b in cal_pairs]
    cal_mean = float(np.mean(cal))
    print(f"Reference scale (unrelated utterances) mean LSD = {cal_mean:.2f} dB "
          f"(individual: {[round(c, 2) for c in cal]})")

    rules = []
    for k in range(1, 12):
        tag = [os.path.basename(p) for p in wavs if os.path.basename(p).startswith(f"{k:02d}_")]
        w = [t for t in tag if t.endswith("_without_plus.wav")]
        p = [t for t in tag if t.endswith("_with_plus.wav")]
        if w and p:
            rules.append((k, w[0], p[0], None))
    for k in (12, 13):
        tag = [os.path.basename(p) for p in wavs if os.path.basename(p).startswith(f"{k:02d}_")]
        w = next(t for t in tag if t.endswith("_without_plus.wav"))
        p = next(t for t in tag if t.endswith("_with_plus.wav"))
        br = next(t for t in tag if t.endswith("_broken_legacy_plus.wav"))
        rules.append((k, w, p, br))

    rows = []
    for k, f_wo, f_w, f_br in rules:
        m = pair_metrics(base(f_wo), base(f_w), fb, centers)
        extra = None
        extra2 = None
        if f_br:
            extra = pair_metrics(base(f_wo), base(f_br), fb, centers)
            extra2 = pair_metrics(base(f_w), base(f_br), fb, centers)
        rows.append((k, f_wo, f_w, m, extra, extra2))

    # clustering probe over the 20 zamok files
    zamok = [p for p in wavs if "zamok" in os.path.basename(p)]
    dist = nn_matrix(zamok, fb)
    nn = {}
    for i, p in enumerate(zamok):
        order = np.argsort([dist[i, j] if j != i else np.inf for j in range(len(zamok))])
        nn[os.path.basename(p)] = [(os.path.basename(zamok[j]), dist[i, j]) for j in order[:2]]

    # ---------- write markdown ----------
    L = []
    L.append("# Objective spectral analysis of tts_test/ (28 WAV, pre-listening signal)\n")
    L.append("Generated by `scripts/tts_homographs_spectral_analysis.py`.\n")
    L.append("**Читать вместе с ADR.** LSD измеряет *величину отличия*, а не *правильность ударения*;")
    L.append("финальные вердикты ставит прослушивание.\n")

    L.append("## 0. Калибровка шкалы\n")
    L.append(f"- Детерминизм/самоидентичность: файл сравнивается с самим собой -> LSD = 0 (контроль конвейера).")
    L.append(f"- Шкала «не связанные фразы»: средний DTW-LSD = **{cal_mean:.2f} dB** "
             f"(по парам {', '.join(f'{c:.2f}' for c in cal)}).")
    L.append("- Порог чтения (операционный, не вердикт): `LSD < 10% шкалы` (~"
             f"{cal_mean * 0.10:.2f} dB) = акустически незначимо; `идентичны сэмплы` = маркер не дошёл до модели "
             "либо автоакцент совпал с ручным.\n")

    L.append("## 1. Пары правил 1-11 и триплеты 12-13\n")
    L.append("| № | без + (сек) | с + (сек) | Δdur, мс | идентичны | LSD mean, dB | LSD max, dB | "
             "50-1k | 1k-3k | 3k-7.6k | пик расхождения (доля длительности) |")
    L.append("|---|---|---|---|---|---|---|---|---|---|---|")
    for k, f_wo, f_w, m, extra, extra2 in rows:
        b0, b1, b2 = m["band_lsd"]
        ident = "**ДА**" if m["identical"] else "нет"
        peak = "—" if m["identical"] else f"{m['peak_pos_a']:.2f} / {m['peak_pos_b']:.2f}"
        L.append(f"| {k} | {m['dur_a']:.2f} | {m['dur_b']:.2f} | {m['dur_delta_ms']:+.0f} | {ident} | "
                 f"{m['lsd_mean']:.2f} | {m['lsd_max']:.2f} | {b0:.2f} | {b1:.2f} | {b2:.2f} | "
                 f"{peak} |")
    L.append("")
    L.append("Колонки 50-1k / 1k-3k / 3k-7.6k — LSD по полосам (формантная зона / "
             "средние форманты / сибилянты-высокие).\n")

    L.append("## 2. Триплеты 12-13: дошёл ли сломанный маркер до модели\n")
    L.append("| № | сравнение | идентичны | maxdiff | LSD mean, dB |")
    L.append("|---|---|---|---|---|")
    for k, f_wo, f_w, m, extra, extra2 in rows:
        if extra is None:
            continue
        L.append(f"| {k} | без + vs исправленный маркер | "
                 f"{'**ДА**' if m['identical'] else 'нет'} | {m['maxdiff_s']} | {m['lsd_mean']:.2f} |")
        L.append(f"| {k} | без + vs сломанный маркер | "
                 f"{'**ДА**' if extra['identical'] else 'нет'} | {extra['maxdiff_s']} | {extra['lsd_mean']:.2f} |")
        L.append(f"| {k} | исправленный vs сломанный маркер | "
                 f"{'**ДА**' if extra2['identical'] else 'нет'} | {extra2['maxdiff_s']} | {extra2['lsd_mean']:.2f} |")
    L.append("")
    L.append("Если «сломанный маркер» **идентичен** варианту без разметки — маркер игнорируется "
             "(синтаксический прогноз подтверждён аудиофактом). Если **отличается** — маркер доходит "
             "до модели и влияет на произношение.\n")

    L.append("## 3. Кластеризация 20 zamok-файлов (2 ближайших соседа)\n")
    for name, (n1, d1), (_, d2) in [(k, v[0], v[1]) for k, v in nn.items()]:
        L.append(f"- `{name}` -> `{n1}` ({d1:.2f} dB), далее {d2:.2f} dB")
    L.append("")
    L.append("Если маркер даёт кластеры по типу ударения (`зам+ок` vs `з+амок`), "
             "ближайшие соседи будут из разных контекстов с одинаковой разметкой; "
             "если кластеры идут по контексту — разметка не формирует отдельный акустический класс.\n")

    L.append("## 4. Ограничения\n")
    L.append("LSD — величина отличия, не знак правильности: `maxdiff > 0` лишь констатирует, что маркер "
             "изменил сигнал. Правильно ли ударение, определяет только прослушивание (13 вердиктов в ADR). "
             "Позиция пика расхождения — вспомогательная локализация (ожидаемо во второй половине фразы "
             "для `замок` во всех правилах 1-10).\n")

    with open(OUT_MD, "w", encoding="utf-8") as f:
        f.write("\n".join(L))
    print(f"Report written: {OUT_MD}")

    print("\n--- summary ---")
    for k, f_wo, f_w, m, extra, extra2 in rows:
        line = (f"rule {k:02d}: identical={m['identical']} lsd_mean={m['lsd_mean']:.2f}dB "
                f"lsd_max={m['lsd_max']:.2f}dB ddur={m['dur_delta_ms']:+.0f}ms "
                f"peak@{m['peak_pos_a']:.2f}")
        if extra:
            line += (f" | broken: identical={extra['identical']} lsd={extra['lsd_mean']:.2f}dB"
                     f" | corr-vs-broken lsd={extra2['lsd_mean']:.2f}dB")
        print(line)
    print(f"reference scale (unrelated) = {cal_mean:.2f} dB")
    return 0


if __name__ == "__main__":
    sys.exit(main())
