const path = require('path');
const fs = require('fs');

let sherpa = null;
let sileroVad = null;
let gigaamRecognizer = null;
let whisperRecognizer = null;
let sherpaOnline = null;
let sherpaStream = null;

let isGigaamReady = false;
let isWhisperReady = false;
let isVadReady = false;
let cachedWhisperConfig = null;

function ensureWhisperReady() {
  if (isWhisperReady && whisperRecognizer) {
    return true;
  }
  if (!cachedWhisperConfig) {
    return false;
  }
  try {
    if (!sherpa) sherpa = require('sherpa-onnx-node');
    whisperRecognizer = new sherpa.OfflineRecognizer(cachedWhisperConfig);
    isWhisperReady = true;
    console.log('[STT Worker] Whisper Small int8 initialized lazily (floor engine)');
    if (process.send) {
      process.send({ type: 'engine_ready', engine: 'whisper' });
    }
    return true;
  } catch (eWhisper) {
    console.warn('[STT Worker] Lazy Whisper init failed:', eWhisper.message || eWhisper);
    whisperRecognizer = null;
    isWhisperReady = false;
    return false;
  }
}

// Audio accumulation ring buffer for active speech
let speechAudioBuffer = [];
let isSpeakingActive = false;
let sttEngineSetting = 'gigaam'; // 'gigaam' | 'legacy'
let lastWakeWordSegmentTime = 0; // Tracks standalone wake-word for phrase bridging
let lastEmittedPartial = '';
let lastPartialEmitTime = 0;
let lastGigaPartialDecodeTime = 0;

// Pre-speech ring buffer to preserve initial explosive consonants (e.g. 'к' in 'кто ты')
// 350 ms at 16kHz = 5600 samples
const PRE_SPEECH_CAPACITY = 5600;
const preSpeechRing = new Float32Array(PRE_SPEECH_CAPACITY);
let preSpeechCount = 0;
let preSpeechWriteIdx = 0;

function pushPreSpeech(samples) {
  for (let i = 0; i < samples.length; i++) {
    preSpeechRing[preSpeechWriteIdx] = samples[i];
    preSpeechWriteIdx = (preSpeechWriteIdx + 1) % PRE_SPEECH_CAPACITY;
    if (preSpeechCount < PRE_SPEECH_CAPACITY) preSpeechCount++;
  }
}

function getPreSpeechSamples() {
  if (preSpeechCount === 0) return new Float32Array(0);
  const out = new Float32Array(preSpeechCount);
  const startIdx = (preSpeechWriteIdx - preSpeechCount + PRE_SPEECH_CAPACITY) % PRE_SPEECH_CAPACITY;
  for (let i = 0; i < preSpeechCount; i++) {
    out[i] = preSpeechRing[(startIdx + i) % PRE_SPEECH_CAPACITY];
  }
  return out;
}

function clearPreSpeech() {
  preSpeechCount = 0;
  preSpeechWriteIdx = 0;
}

try {
  sherpa = require('sherpa-onnx-node');
} catch (err) {
  if (process.send) {
    process.send({
      type: 'init_result',
      success: false,
      error: 'Cannot load sherpa-onnx-node: ' + (err.message || String(err))
    });
  }
}

process.on('message', (msg) => {
  if (!msg || typeof msg !== 'object') return;

  if (msg.type === 'init') {
    try {
      if (!sherpa) sherpa = require('sherpa-onnx-node');

      if (msg.sttEngine) {
        sttEngineSetting = msg.sttEngine;
      }

      // 1. Cache Whisper config and initialize immediately ONLY if in legacy mode
      if (msg.whisperConfig) {
        cachedWhisperConfig = msg.whisperConfig;
      }
      if (sttEngineSetting !== 'gigaam') {
        ensureWhisperReady();
      }

      // 2. Init Silero VAD (ONNX)
      if (msg.vadConfig) {
        try {
          sileroVad = new sherpa.Vad(msg.vadConfig, 30);
          isVadReady = true;
          console.log('[STT Worker] Silero VAD initialized successfully');
        } catch (eVad) {
          console.warn('[STT Worker] Silero VAD init failed, falling back to basic endpointing:', eVad.message || eVad);
          sileroVad = null;
          isVadReady = false;
        }
      }

      const isPureGigaamMode = sttEngineSetting === 'gigaam';
      // 3. Init Sherpa (zipformer) ONLY in legacy mode
      if (!isPureGigaamMode && msg.sherpaConfig) {
        try {
          sherpaOnline = new sherpa.OnlineRecognizer(msg.sherpaConfig);
          sherpaStream = sherpaOnline.createStream();
          console.log('[STT Worker] Sherpa Zipformer initialized successfully');
        } catch (eSherpa) {
          console.warn('[STT Worker] Sherpa Zipformer init failed:', eSherpa.message || eSherpa);
          sherpaOnline = null;
          sherpaStream = null;
        }
      }

      // 4. Init GigaAM Multilingual CTC (ONNX) if provided
      if (msg.gigaamConfig) {
        try {
          gigaamRecognizer = new sherpa.OfflineRecognizer(msg.gigaamConfig);
          isGigaamReady = true;
          console.log('[STT Worker] GigaAM CTC 220M initialized successfully (single active engine)');
          if (process.send) {
            process.send({ type: 'engine_ready', engine: 'gigaam' });
          }
        } catch (eGiga) {
          console.warn('[STT Worker] GigaAM CTC init failed:', eGiga.message || eGiga);
          gigaamRecognizer = null;
          isGigaamReady = false;
          // Synchronous fallback to Whisper floor if GigaAM init fails
          ensureWhisperReady();
        }
      } else if (sttEngineSetting === 'gigaam') {
        // GigaAM mode requested without config -> ensure floor engine is ready
        ensureWhisperReady();
      }

      // 5. Invariant: Always ≥ 1 initialized engine (Whisper Small is non-removable floor)
      if (!isGigaamReady && !isWhisperReady && cachedWhisperConfig) {
        ensureWhisperReady();
      }

      // Zero-engine check
      if (!isGigaamReady && !isWhisperReady && !sherpaOnline) {
        console.error('[STT Worker] Invariant violated: Zero STT engines initialized!');
        if (process.send) {
          process.send({
            type: 'zero_engines_error',
            error: 'Не удалось инициализировать ни один движок STT (неснимаемый пол)'
          });
        }
      }

      if (process.send) {
        process.send({
          type: 'init_result',
          success: true,
          hasGigaam: isGigaamReady,
          hasWhisper: isWhisperReady,
          hasVad: isVadReady,
          hasSherpa: !!sherpaOnline
        });
        process.send({
          type: 'worker-ready',
          success: true,
          hasGigaam: isGigaamReady,
          hasWhisper: isWhisperReady,
          hasVad: isVadReady,
          hasSherpa: !!sherpaOnline
        });
      }
    } catch (e) {
      if (process.send) {
        process.send({ type: 'init_result', success: false, error: e.message || String(e) });
      }
      setTimeout(() => process.exit(0), 30);
    }
  } else if (msg.type === 'load_gigaam') {
    try {
      if (!sherpa) sherpa = require('sherpa-onnx-node');
      if (msg.gigaamConfig) {
        gigaamRecognizer = new sherpa.OfflineRecognizer(msg.gigaamConfig);
        isGigaamReady = true;
        console.log('[STT Worker] Hot-swapped GigaAM CTC 220M engine successfully');
        if (process.send) {
          process.send({ type: 'engine_ready', engine: 'gigaam' });
        }
      }
    } catch (eGiga) {
      console.warn('[STT Worker] Hot-swap GigaAM failed:', eGiga.message || eGiga);
      gigaamRecognizer = null;
      isGigaamReady = false;
      if (process.send) {
        process.send({ type: 'gigaam_load_failed', error: eGiga.message || String(eGiga) });
      }
    }
  } else if (msg.type === 'fallback_to_whisper') {
    console.log('[STT Worker] Fallback to Whisper floor requested');
    if (sherpaOnline && sherpaStream) {
      try {
        sherpaOnline.reset(sherpaStream);
      } catch (e) {}
    }
    sttEngineSetting = 'legacy';
    ensureWhisperReady();
    if (isWhisperReady && process.send) {
      process.send({ type: 'engine_ready', engine: 'whisper' });
    }
  } else if (msg.type === 'set_engine') {
    if (msg.sttEngine) {
      sttEngineSetting = msg.sttEngine;
      console.log(`[STT Worker] STT engine mode set to: ${sttEngineSetting}`);
      if (sttEngineSetting === 'legacy') {
        ensureWhisperReady();
      }
    }
  } else if (msg.type === 'reset_buffer') {
    if (sherpaOnline && sherpaStream) {
      try {
        sherpaOnline.reset(sherpaStream);
      } catch (e) {}
    }
    if (sileroVad && isVadReady) {
      try {
        sileroVad.reset();
      } catch (e) {}
    }
    speechAudioBuffer = [];
    clearPreSpeech();
    isSpeakingActive = false;
    lastGigaPartialDecodeTime = 0;
  } else if (msg.type === 'chunk') {
    try {
      const rawSamples = msg.samples;
      const samples = rawSamples instanceof Float32Array ? rawSamples : new Float32Array(rawSamples);
      if (samples.length === 0) return;
      const sampleRate = msg.sampleRate || 16000;

      // Feed to Sherpa streaming recognizer for wake-word and fast partial feedback
      let partialText = '';
      if (sherpaOnline && sherpaStream) {
        sherpaStream.acceptWaveform({ samples, sampleRate });
        while (sherpaOnline.isReady(sherpaStream)) {
          sherpaOnline.decode(sherpaStream);
        }
        const result = sherpaOnline.getResult(sherpaStream);
        partialText = (result && result.text) ? result.text.trim() : '';
        if (partialText && process.send) {
          const nowPartial = Date.now();
          if (partialText !== lastEmittedPartial || nowPartial - lastPartialEmitTime >= 180) {
            lastEmittedPartial = partialText;
            lastPartialEmitTime = nowPartial;
            process.send({ type: 'partial', text: partialText });
          }
        }
      }

      // VAD processing
      if (sileroVad && isVadReady) {
        sileroVad.acceptWaveform(samples);

        // Check if speech is detected
        if (sileroVad.isDetected()) {
          if (!isSpeakingActive) {
            isSpeakingActive = true;
            const pre = getPreSpeechSamples();
            for (let i = 0; i < pre.length; i++) speechAudioBuffer.push(pre[i]);
            clearPreSpeech();
            if (process.send && !sherpaOnline) {
              process.send({ type: 'partial', text: 'СЛУШАЮ...' });
            }
          }
          // Accumulate samples into speech audio buffer
          for (let i = 0; i < samples.length; i++) {
            speechAudioBuffer.push(samples[i]);
          }
          // Periodic streaming partial decode in single-model GigaAM mode for dynamic KV-cache prefill
          if (
            !sherpaOnline &&
            sttEngineSetting === 'gigaam' &&
            gigaamRecognizer &&
            isGigaamReady &&
            speechAudioBuffer.length >= 6400
          ) {
            const nowGiga = Date.now();
            if (nowGiga - lastGigaPartialDecodeTime >= 350) {
              lastGigaPartialDecodeTime = nowGiga;
              try {
                const stream = gigaamRecognizer.createStream();
                if (stream && typeof stream.acceptWaveform === 'function') {
                  stream.acceptWaveform({ samples: new Float32Array(speechAudioBuffer), sampleRate });
                  gigaamRecognizer.decode(stream);
                  const gigaRes = gigaamRecognizer.getResult(stream);
                  const gigaPartial = (gigaRes && gigaRes.text) ? gigaRes.text.trim() : '';
                  if (gigaPartial && gigaPartial !== lastEmittedPartial && process.send) {
                    lastEmittedPartial = gigaPartial;
                    lastPartialEmitTime = nowGiga;
                    process.send({ type: 'partial', text: gigaPartial });
                  }
                }
              } catch (_) {}
            }
          }
        } else if (isSpeakingActive) {
          // Accumulate tail samples
          for (let i = 0; i < samples.length; i++) {
            speechAudioBuffer.push(samples[i]);
          }
        } else {
          // In silence, keep rolling pre-speech ring buffer
          pushPreSpeech(samples);
        }

        // Guard against unbounded speech buffer (> 9s at 16kHz = 144000 samples)
        if (speechAudioBuffer.length >= 144000) {
          decodeSpeechSegment(new Float32Array(speechAudioBuffer), partialText);
          speechAudioBuffer = [];
          isSpeakingActive = false;
          clearPreSpeech();
          lastEmittedPartial = '';
          lastGigaPartialDecodeTime = 0;
          try { sileroVad.reset(); } catch (_) {}
          if (sherpaOnline && sherpaStream) {
            try { sherpaOnline.reset(sherpaStream); } catch (_) {}
          }
        }

        // Check if VAD generated finished speech segments
        while (!sileroVad.isEmpty()) {
          const segment = sileroVad.front(false);
          sileroVad.pop();

          if (speechAudioBuffer.length > 0) {
            decodeSpeechSegment(new Float32Array(speechAudioBuffer), partialText);
          } else if (segment && segment.samples && segment.samples.length > 0) {
            decodeSpeechSegment(new Float32Array(segment.samples), partialText);
          }
          speechAudioBuffer = [];
          isSpeakingActive = false;
          lastEmittedPartial = '';
          lastGigaPartialDecodeTime = 0;
          clearPreSpeech();

          if (sherpaOnline && sherpaStream) {
            sherpaOnline.reset(sherpaStream);
          }
        }
      } else {
        // Fallback: If VAD is not active, accumulate samples and use Sherpa endpointing
        for (let i = 0; i < samples.length; i++) {
          speechAudioBuffer.push(samples[i]);
        }

        if ((sherpaOnline && sherpaStream && sherpaOnline.isEndpoint(sherpaStream)) || speechAudioBuffer.length >= 144000) {
          decodeSpeechSegment(new Float32Array(speechAudioBuffer), partialText);
          speechAudioBuffer = [];
          lastEmittedPartial = '';
          if (sherpaOnline && sherpaStream) {
            sherpaOnline.reset(sherpaStream);
          }
        }
      }
    } catch (err) {
      if (process.send) {
        process.send({ type: 'error', error: err.message || String(err) });
      }
    }
  } else if (msg.type === 'end_stream') {
    try {
      let segmentDecoded = false;
      if (sileroVad && isVadReady) {
        sileroVad.flush();
        while (!sileroVad.isEmpty()) {
          const segment = sileroVad.front(false);
          sileroVad.pop();
          if (speechAudioBuffer.length > 0) {
            decodeSpeechSegment(new Float32Array(speechAudioBuffer), '');
            segmentDecoded = true;
          } else if (segment && segment.samples && segment.samples.length > 0) {
            decodeSpeechSegment(new Float32Array(segment.samples), '');
            segmentDecoded = true;
          }
        }
      }

      if (!segmentDecoded && speechAudioBuffer.length > 0) {
        let partialText = '';
        if (sherpaOnline && sherpaStream) {
          sherpaStream.inputFinished();
          while (sherpaOnline.isReady(sherpaStream)) {
            sherpaOnline.decode(sherpaStream);
          }
          const result = sherpaOnline.getResult(sherpaStream);
          partialText = (result && result.text) ? result.text.trim() : '';
          sherpaOnline.reset(sherpaStream);
        }
        decodeSpeechSegment(new Float32Array(speechAudioBuffer), partialText);
      }
      speechAudioBuffer = [];
    } catch (err) {
      console.error('[STT Worker] end_stream error:', err);
    }
  } else if (msg.type === 'ping') {
    if (process.send) process.send({ type: 'pong', mem: process.memoryUsage() });
  }
});

function decodeSpeechSegment(samples, fallbackSherpaText) {
  if (!samples || samples.length < 1600) { // skip segments shorter than 100ms
    if (fallbackSherpaText && process.send) {
      process.send({ type: 'final', text: fallbackSherpaText, engine: 'sherpa', latencyMs: 0 });
    }
    return;
  }

  const startTime = Date.now();
  let finalRawText = '';
  let engineUsed = 'sherpa';

  // Strategy based on setting:
  // 1. If 'gigaam': ONLY GigaAM CTC decodes (single-model architecture)
  // 2. If 'legacy': try Whisper -> Sherpa
  if (sttEngineSetting === 'gigaam') {
    if (gigaamRecognizer && isGigaamReady) {
      try {
        const stream = gigaamRecognizer.createStream();
        stream.acceptWaveform({ samples, sampleRate: 16000 });
        gigaamRecognizer.decode(stream);
        const res = gigaamRecognizer.getResult(stream);
        if (res && res.text && res.text.trim()) {
          finalRawText = res.text.trim();
          engineUsed = 'gigaam';
        }
      } catch (eGiga) {
        console.warn('[STT] GigaAM decode error:', eGiga.message || eGiga);
        ensureWhisperReady();
      }
    } else {
      ensureWhisperReady();
    }
    // Floor fallback when GigaAM is still loading or yielded empty text
    if (!finalRawText && whisperRecognizer && isWhisperReady) {
      console.log('[STT Worker] Whisper floor active, decoding...');
      try {
        const stream = whisperRecognizer.createStream();
        stream.acceptWaveform({ samples, sampleRate: 16000 });
        whisperRecognizer.decode(stream);
        const res = whisperRecognizer.getResult(stream);
        if (res && res.text && res.text.trim()) {
          finalRawText = res.text.trim();
          engineUsed = 'whisper';
        }
      } catch (eW) {
        console.warn('[STT] Floor Whisper decode error:', eW.message || eW);
      }
    }
  } else {
    // Legacy mode: Whisper Small int8 with Sherpa fallback
    if (!isWhisperReady && cachedWhisperConfig) {
      ensureWhisperReady();
    }
    if (whisperRecognizer && isWhisperReady) {
      try {
        const stream = whisperRecognizer.createStream();
        stream.acceptWaveform({ samples, sampleRate: 16000 });
        whisperRecognizer.decode(stream);
        const res = whisperRecognizer.getResult(stream);
        if (res && res.text && res.text.trim()) {
          finalRawText = res.text.trim();
          engineUsed = 'whisper';
        }
      } catch (eWhisper) {
        console.warn('[STT] Whisper decode failed, falling back to Sherpa:', eWhisper.message || eWhisper);
      }
    }

    // Fallback 2: Sherpa Zipformer result
    if (!finalRawText && fallbackSherpaText) {
      finalRawText = fallbackSherpaText;
      engineUsed = 'sherpa';
    }
  }

  // Cross-check: Reconcile offline engine (GigaAM/Whisper) with streaming Sherpa
  if (finalRawText && fallbackSherpaText) {
    const rawLower = finalRawText.toLowerCase();
    const sherpaLower = fallbackSherpaText.toLowerCase();

    // 1. Phonetically clipped question ("то ты" vs "кто ты" / "арк кто ты")
    if (/^то\s+(ты|вы|такой|такая|это|здесь|там|говорит|создал|автор)/i.test(rawLower)) {
      if (/кто\s+(ты|вы|такой|такая|это|здесь|там|говорит|создал|автор)/i.test(sherpaLower)) {
        finalRawText = finalRawText.replace(/^то\b/i, 'кто');
      }
    }

    // 2. GigaAM/Whisper acoustic mishearing: "представьте" vs "представься"
    if (/(?:^|\s)представьте(?:сь)?(?:\s|$|[.,!?])/i.test(rawLower) && /(?:^|\s)представься(?:\s|$|[.,!?])/i.test(sherpaLower)) {
      finalRawText = finalRawText.replace(/представьте(?:сь)?/gi, 'представься');
    }

    // 3. Initial wake-word retention: if streaming Sherpa heard "Арк" / "a.r.c." but GigaAM swallowed it
    const wakePattern = /^(?:арк|arc|а\.р\.к\.|a\.r\.c\.)(?:\s+|$|[.,!?])/i;
    if (wakePattern.test(sherpaLower) && !wakePattern.test(rawLower)) {
      finalRawText = 'Арк, ' + finalRawText;
    }

    // 4. Whisper/GigaAM acoustic hallucination: "как джон" / "как дон" vs "как дела"
    if (/(?:^|\s)(?:как\s+)?(?:джон|дон)(?:\s|$|[.,!?])/i.test(rawLower) && /(?:^|\s)дела(?:\s|$|[.,!?])/i.test(sherpaLower)) {
      finalRawText = finalRawText.replace(/\b(?:как\s+)?(?:джон|дон)\b/gi, 'как дела');
    }
  }

  // 5. Standalone or wake-addressed "представьте" / "представьтесь" -> "представься"
  if (/(?:^|\b)(?:арк|arc|а\.р\.к\.|a\.r\.c\.)?\s*представьте(?:сь)?(?:\s*|[.,!?]*)$/i.test(finalRawText.trim())) {
    finalRawText = finalRawText.replace(/представьте(?:сь)?/gi, 'представься');
  }

  // 6. Standalone Whisper acoustic hallucination catch: "как джон" / "как дон" -> "как дела"
  if (/(?:^|\b)(?:арк|arc|а\.р\.к\.|a\.r\.c\.)?\s*как\s+(?:джон|дон)[.,!?]*$/i.test(finalRawText.trim())) {
    finalRawText = finalRawText.replace(/как\s+(?:джон|дон)/gi, 'как дела');
  } else if (/(?:^|\s)как\s+(?:джон|дон)(?:\s|$|[.,!?])/i.test(finalRawText)) {
    finalRawText = finalRawText.replace(/\bкак\s+(?:джон|дон)\b/gi, 'как дела');
  }

  // 5. Multi-segment bridge: If previous segment was a standalone wake-word and user paused before command
  const isStandaloneWake = /^(?:арк|arc|а\.р\.к\.|a\.r\.c\.)[.,!?]*$/i.test(finalRawText.trim());
  const now = Date.now();
  if (isStandaloneWake) {
    lastWakeWordSegmentTime = now;
  } else if (lastWakeWordSegmentTime > 0 && (now - lastWakeWordSegmentTime) < 4000) {
    const wakePattern = /^(?:арк|arc|а\.р\.к\.|a\.r\.c\.)(?:\s+|$|[.,!?])/i;
    if (!wakePattern.test(finalRawText.trim())) {
      finalRawText = 'Арк, ' + finalRawText;
    }
    lastWakeWordSegmentTime = 0;
  }

  const latencyMs = Date.now() - startTime;
  console.log(`[STT] engine=${engineUsed}, latency_ms=${latencyMs}`);

  if (finalRawText && process.send) {
    process.send({
      type: 'final',
      text: finalRawText,
      engine: engineUsed,
      latencyMs
    });
  }
}
