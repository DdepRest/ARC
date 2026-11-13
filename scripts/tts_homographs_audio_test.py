import os
import sys

def main():
    try:
        import torch
        import soundfile as sf
    except ImportError as e:
        print(f"[ERROR] Required packages not found: {e}")
        print("Please activate silero_env before running this script:")
        print("  silero_env\\Scripts\\activate.bat")
        print("  python scripts\\tts_homographs_audio_test.py")
        sys.exit(1)

    print("=" * 60)
    print("A.R.C. TTS HOMOGRAPHS & ACCENT AUDIO TEST HARNESS (28 SAMPLES)")
    print("=" * 60)

    # 1. Resolve model path across all 5 candidate locations (mirroring silero_server.py:25-31)
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(script_dir)

    candidate_model_paths = [
        os.path.join(project_root, 'resources', 'models', 'silero-v5', 'v5_6_ru.pt'),
        os.path.join(project_root, 'models', 'silero-v5', 'v5_6_ru.pt'),
        os.path.join(project_root, 'v5_6_ru.pt'),
        'v5_6_ru.pt',
        os.path.expanduser('~/.cache/torch/hub/snakers4_silero-models_master/v5_6_ru.pt'),
        os.path.expanduser('~/.cache/torch/hub/checkpoints/v5_6_ru.pt'),
        os.path.join(project_root, 'Voice', 'models', 'v5_6_ru.pt')
    ]

    model_path = None
    for p in candidate_model_paths:
        if os.path.exists(p) and os.path.getsize(p) > 10 * 1024 * 1024:
            model_path = p
            print(f"[Model] Found Silero v5.6 at: {model_path} ({os.path.getsize(p)} bytes)")
            break

    if not model_path:
        print("[ERROR] Could not find v5_6_ru.pt in any candidate path:")
        for p in candidate_model_paths:
            print(f"  - {p}")
        print("Please ensure v5_6_ru.pt is downloaded or start A.R.C. once to auto-download.")
        sys.exit(1)

    print("[Model] Loading torch package importer...")
    device = torch.device('cpu')
    model = torch.package.PackageImporter(model_path).load_pickle("tts_models", "model")
    model.to(device)
    print("[Model] Silero model loaded successfully on CPU.")

    # 2. Output directory
    out_dir = os.path.join(project_root, "tts_test")
    os.makedirs(out_dir, exist_ok=True)
    print(f"[Output] Saving audio samples to: {out_dir}")

    # Production synthesis parameters (strictly mirroring silero_server.py & tts.service.ts)
    speaker_id = "eugene"
    sample_rate = 48000
    put_accent = True
    put_yo = True

    # 3. Test definitions:
    # 11 Standard Homograph Pairs (Voice/dicts/tts_dict_homographs.json)
    standard_rules = [
        ("01_dvernoy_zamok", "дверной замок", "дверной зам+ок"),
        ("02_otkryt_zamok", "открыть замок", "открыть зам+ок"),
        ("03_v_zamok", "в замок", "в зам+ок"),
        ("04_na_zamok", "на замок", "на зам+ок"),
        ("05_slomat_zamok", "сломать замок", "сломать зам+ок"),
        ("06_zakryt_na_zamok", "закрыт на замок", "закрыт на зам+ок"),
        ("07_srednevekovy_zamok", "средневековый замок", "средневековый з+амок"),
        ("08_stary_zamok", "старый замок", "старый з+амок"),
        ("09_krasivy_zamok", "красивый замок", "красивый з+амок"),
        ("10_postroit_zamok", "построить замок", "построить з+амок"),
        ("11_zdorovo", "Это здорово", "Это здор+ово"),
    ]

    # 2 Triplets for Rules 12 & 13 (Without, Corrected, Broken Legacy)
    defect_rules = [
        (
            "12_sistema",
            "система работает",          # Without plus
            "сист+ема работает",         # Corrected plus
            "+система работает"          # Broken legacy plus
        ),
        (
            "13_na_svyazi",
            "Оператор на связи",         # Without plus
            "Оператор на св+язи",        # Corrected plus
            "Оператор на свя+зи"         # Broken legacy plus
        ),
    ]

    total_files = len(standard_rules) * 2 + len(defect_rules) * 3
    generated_count = 0

    print(f"\n[Synthesizing] Generating {total_files} WAV files (PCM_16 @ 48kHz)...")

    # Generate Standard Pairs
    for tag, text_without, text_with in standard_rules:
        # A: without plus
        path_without = os.path.join(out_dir, f"{tag}_without_plus.wav")
        tensor_without = model.apply_tts(
            text=text_without,
            speaker=speaker_id,
            sample_rate=sample_rate,
            put_accent=put_accent,
            put_yo=put_yo
        )
        sf.write(path_without, tensor_without.numpy(), sample_rate, subtype='PCM_16')
        generated_count += 1
        print(f"  [{generated_count:02d}/{total_files:02d}] {os.path.basename(path_without)}: \"{text_without}\"")

        # B: with plus
        path_with = os.path.join(out_dir, f"{tag}_with_plus.wav")
        tensor_with = model.apply_tts(
            text=text_with,
            speaker=speaker_id,
            sample_rate=sample_rate,
            put_accent=put_accent,
            put_yo=put_yo
        )
        sf.write(path_with, tensor_with.numpy(), sample_rate, subtype='PCM_16')
        generated_count += 1
        print(f"  [{generated_count:02d}/{total_files:02d}] {os.path.basename(path_with)}: \"{text_with}\"")

    # Generate Triplets for Rules 12 & 13
    for tag, text_without, text_corrected, text_broken in defect_rules:
        # A: without plus
        path_without = os.path.join(out_dir, f"{tag}_without_plus.wav")
        tensor_without = model.apply_tts(
            text=text_without,
            speaker=speaker_id,
            sample_rate=sample_rate,
            put_accent=put_accent,
            put_yo=put_yo
        )
        sf.write(path_without, tensor_without.numpy(), sample_rate, subtype='PCM_16')
        generated_count += 1
        print(f"  [{generated_count:02d}/{total_files:02d}] {os.path.basename(path_without)}: \"{text_without}\"")

        # B: with corrected plus
        path_with = os.path.join(out_dir, f"{tag}_with_plus.wav")
        tensor_with = model.apply_tts(
            text=text_corrected,
            speaker=speaker_id,
            sample_rate=sample_rate,
            put_accent=put_accent,
            put_yo=put_yo
        )
        sf.write(path_with, tensor_with.numpy(), sample_rate, subtype='PCM_16')
        generated_count += 1
        print(f"  [{generated_count:02d}/{total_files:02d}] {os.path.basename(path_with)}: \"{text_corrected}\"")

        # C: with broken legacy plus
        path_broken = os.path.join(out_dir, f"{tag}_broken_legacy_plus.wav")
        tensor_broken = model.apply_tts(
            text=text_broken,
            speaker=speaker_id,
            sample_rate=sample_rate,
            put_accent=put_accent,
            put_yo=put_yo
        )
        sf.write(path_broken, tensor_broken.numpy(), sample_rate, subtype='PCM_16')
        generated_count += 1
        print(f"  [{generated_count:02d}/{total_files:02d}] {os.path.basename(path_broken)}: \"{text_broken}\"")

    print("\n" + "=" * 60)
    print(f"SUCCESS: Generated {generated_count} audio files in: {out_dir}")
    print("=" * 60)
    print("\nNext steps:")
    print("1. Listen to each pair/triplet in tts_test/")
    print("2. Record in docs/adr/tts-homographs-classification.md which variant sounds correct.")
    print("3. Derive verdicts according to the action matrix (сохранить / избыточно / некорректно).")

if __name__ == '__main__':
    main()
