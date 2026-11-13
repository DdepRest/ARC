export const IPC_CHANNELS = {
    FILES: 'system:files',
    VOICE: 'system:voice',
    SYSTEM: 'system:info',
    VOICE_STREAM_CHUNK: 'voice:stream-chunk',
    VOICE_STREAM_END: 'voice:stream-end',
    STT_PARTIAL: 'stt:partial',
    STT_STATUS: 'stt:status',
    STT_MODEL_DOWNLOAD_PROGRESS: 'stt:model-download-progress',
    STT_RELOAD: 'stt:reload',
    TTS_SERVER_STATUS: 'tts:server-status'
} as const;
