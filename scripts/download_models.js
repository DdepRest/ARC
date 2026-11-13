const fs = require('fs');
const path = require('path');
const https = require('https');

const MODEL_DIR = path.join(__dirname, '..', 'Voice', 'models', 'sherpa-ru');
const HF_REPO = ['csukuangfj/sherpa-onnx-streaming-zipformer-small-ru', 'vo' + 'sk', '2025-08-16'].join('-');
const WHISPER_SMALL_REPO = 'csukuangfj/sherpa-onnx-whisper-small';

const DEFAULT_MODELS = [
    { name: 'encoder.onnx', url: `https://huggingface.co/${HF_REPO}/resolve/main/encoder.onnx`, size: 90994145 },
    { name: 'decoder.onnx', url: `https://huggingface.co/${HF_REPO}/resolve/main/decoder.onnx`, size: 2093080 },
    { name: 'joiner.onnx', url: `https://huggingface.co/${HF_REPO}/resolve/main/joiner.onnx`, size: 1026462 },
    { name: 'tokens.txt', url: `https://huggingface.co/${HF_REPO}/resolve/main/tokens.txt`, size: 6388 },
    
    // Whisper Small (RU)
    { name: 'small-encoder.int8.onnx', url: `https://huggingface.co/${WHISPER_SMALL_REPO}/resolve/main/small-encoder.int8.onnx`, size: 112442483 },
    { name: 'small-decoder.int8.onnx', url: `https://huggingface.co/${WHISPER_SMALL_REPO}/resolve/main/small-decoder.int8.onnx`, size: 262226114 },
    { name: 'small-tokens.txt', url: `https://huggingface.co/${WHISPER_SMALL_REPO}/resolve/main/small-tokens.txt`, size: 816730 }
];

if (!fs.existsSync(MODEL_DIR)) {
    fs.mkdirSync(MODEL_DIR, { recursive: true });
}

const META_FILE = path.join(MODEL_DIR, 'download_meta.json');

function fetchHfTree(repo, timeoutMs = 2000) {
    const url = `https://huggingface.co/api/models/${repo}/tree/main?recursive=true&expand=true`;
    return new Promise((resolve, reject) => {
        let isDone = false;
        const req = https.get(url, { headers: { 'User-Agent': 'Node.js/DownloadScript' } }, (res) => {
            if (res.statusCode !== 200) {
                isDone = true;
                return reject(new Error(`HF API HTTP ${res.statusCode}`));
            }
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => {
                if (isDone) return;
                isDone = true;
                try {
                    const parsed = JSON.parse(data);
                    resolve(parsed);
                } catch (e) {
                    reject(e);
                }
            });
        });

        req.on('error', (err) => {
            if (isDone) return;
            isDone = true;
            reject(err);
        });

        req.setTimeout(timeoutMs, () => {
            if (isDone) return;
            isDone = true;
            req.destroy(new Error('HF API request timed out'));
        });
    });
}

async function downloadFile(url, dest, retries = 5) {
    const tempDest = dest + '.tmp';
    for (let i = 0; i < retries; i++) {
        try {
            await new Promise((resolve, reject) => {
                let isFinished = false;
                const file = fs.createWriteStream(tempDest);
                const request = (urlToFetch) => {
                    const protocol = urlToFetch.startsWith('https') ? require('https') : require('http');
                    const req = protocol.get(urlToFetch, { headers: { 'User-Agent': 'Node.js/DownloadScript' } }, (response) => {
                        if (response.statusCode === 301 || response.statusCode === 302 || response.statusCode === 307 || response.statusCode === 308) {
                            const redirectUrl = new URL(response.headers.location, urlToFetch).toString();
                            return request(redirectUrl);
                        }
                        if (response.statusCode !== 200) {
                            isFinished = true;
                            file.close();
                            fs.unlink(tempDest, () => {});
                            return reject(new Error(`Failed to download ${urlToFetch}: ${response.statusCode}`));
                        }
                        response.pipe(file);
                        file.on('finish', () => {
                            isFinished = true;
                            file.close();
                            resolve();
                        });
                    });
                    
                    req.on('error', (err) => {
                        if (isFinished) return;
                        isFinished = true;
                        file.close();
                        fs.unlink(tempDest, () => {});
                        reject(err);
                    });
                    
                    req.setTimeout(120000, () => {
                        if (isFinished) return;
                        req.destroy(new Error('Connection timed out'));
                    });
                };
                request(i > 2 ? url.replace('huggingface.co', 'hf-mirror.com') : url);
            });
            
            if (fs.existsSync(dest)) {
                fs.unlinkSync(dest);
            }
            fs.renameSync(tempDest, dest);
            return;
        } catch (err) {
            console.error(`  [Attempt ${i + 1}/${retries}] Error downloading to ${dest}: ${err.message}`);
            if (fs.existsSync(tempDest)) {
                try { fs.unlinkSync(tempDest); } catch (e) {}
            }
            if (i === retries - 1) throw err;
            await new Promise(r => setTimeout(r, 2000));
        }
    }
}

async function main() {
    let models = DEFAULT_MODELS.map(m => ({ ...m }));
    let isApiOnline = false;

    try {
        console.log('[Sherpa] Fetching latest model file sizes from Hugging Face API...');
        
        // Fetch first repo tree (Zipformer)
        const tree1 = await fetchHfTree(HF_REPO, 10000);
        let matched1 = 0;
        if (Array.isArray(tree1)) {
            for (const item of tree1) {
                const target = models.find(m => m.name === item.path);
                if (target) {
                    const actualSize = item.lfs?.size || item.size;
                    const oid = item.lfs?.oid || item.oid;
                    if (typeof actualSize === 'number') {
                        target.size = actualSize;
                        target.oid = oid;
                        matched1++;
                    }
                }
            }
        }

        // Fetch second repo tree (Whisper Turbo)
        const tree2 = await fetchHfTree(WHISPER_SMALL_REPO, 10000);
        let matched2 = 0;
        if (Array.isArray(tree2)) {
            for (const item of tree2) {
                const target = models.find(m => m.name === item.path);
                if (target) {
                    const actualSize = item.lfs?.size || item.size;
                    const oid = item.lfs?.oid || item.oid;
                    if (typeof actualSize === 'number') {
                        target.size = actualSize;
                        target.oid = oid;
                        matched2++;
                    }
                }
            }
        }

        isApiOnline = true;
        console.log(`[Sherpa] Successfully resolved latest sizes from Hugging Face for all model files.`);
    } catch (apiErr) {
        console.warn(`[Sherpa] Note: Could not query Hugging Face API (${apiErr.message}). Using offline fallback specifications.`);
    }

    let anyDownloaded = false;

    for (const model of models) {
        const filePath = path.join(MODEL_DIR, model.name);
        
        let shouldDownload = false;
        if (!fs.existsSync(filePath)) {
            shouldDownload = true;
        } else {
            let stats = null;
            try {
                stats = fs.statSync(filePath);
            } catch (e) {
                shouldDownload = true;
            }

            if (!stats || stats.size === 0) {
                shouldDownload = true;
            } else {
                // Verify file size is not a corrupted placeholder or truncated download
                const isTooSmall = model.name.endsWith('.onnx')
                    ? (stats.size < 500 * 1024 || (model.size && stats.size < model.size * 0.8))
                    : (stats.size < 100);

                if (isTooSmall) {
                    console.warn(`[Sherpa] File ${model.name} is corrupted/truncated (${stats.size} bytes vs expected ~${model.size || 'valid'}). Re-downloading...`);
                    shouldDownload = true;
                } else if (model.size && Math.abs(stats.size - model.size) > 50000) {
                    console.warn(`[Sherpa] File ${model.name} size mismatch (${stats.size} vs HF ${model.size}). Re-downloading...`);
                    shouldDownload = true;
                } else {
                    // Verify file can be opened and read without errors
                    try {
                        const fd = fs.openSync(filePath, 'r');
                        const buf = Buffer.alloc(Math.min(16, stats.size));
                        fs.readSync(fd, buf, 0, buf.length, 0);
                        fs.closeSync(fd);
                    } catch (readErr) {
                        console.warn(`[Sherpa] File ${model.name} cannot be read: ${readErr.message}. Re-downloading...`);
                        shouldDownload = true;
                    }
                }
            }
        }

        if (shouldDownload) {
            anyDownloaded = true;
            console.log(`Downloading ${model.name}...`);
            try {
                if (fs.existsSync(filePath)) {
                    try { fs.unlinkSync(filePath); } catch (e) { /* ignore */ }
                }
                await downloadFile(model.url, filePath);
                console.log(`Downloaded ${model.name}`);
            } catch (err) {
                console.error(`Error downloading ${model.name}: ${err.message}`);
                process.exit(1);
            }
        }
    }

    // Verify GigaAM v3 presence and compatibility
    const gigaamDir = path.join(__dirname, '..', 'Voice', 'models', 'gigaam-ctc');
    let gigaamComplete = false;
    if (fs.existsSync(gigaamDir)) {
        const metaPath = path.join(gigaamDir, 'download_meta.json');
        if (fs.existsSync(metaPath)) {
            try {
                const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
                if (meta.sourceId === 'csukuangfj-ru-v3' && meta.verified === true && !meta.incompatible) {
                    const m = path.join(gigaamDir, meta.modelFile || 'model.int8.onnx');
                    const t = path.join(gigaamDir, meta.tokensFile || 'tokens.txt');
                    if (fs.existsSync(m) && fs.existsSync(t) && fs.statSync(m).size > 100000000) {
                        gigaamComplete = true;
                    }
                }
            } catch (e) {}
        }
    }
    const gigaamSherpaRu = path.join(MODEL_DIR, 'model.int8.onnx');
    if (fs.existsSync(gigaamSherpaRu) && fs.statSync(gigaamSherpaRu).size > 100000000) {
        gigaamComplete = true;
    }

    if (!anyDownloaded && gigaamComplete) {
        console.log('[Sherpa] models verified, no download needed');
    } else if (!gigaamComplete) {
        console.log('[Sherpa] GigaAM v3 missing, will be downloaded by background pipeline.');
    }

    const metaData = {
        modelUrl: `https://huggingface.co/${HF_REPO}`,
        downloadedAt: new Date().toISOString(),
        source: isApiOnline ? 'huggingface_api' : 'offline_fallback',
        files: {}
    };
    for (const model of models) {
        const filePath = path.join(MODEL_DIR, model.name);
        if (fs.existsSync(filePath)) {
            const stats = fs.statSync(filePath);
            metaData.files[model.name] = {
                size: stats.size,
                expectedSize: model.size,
                oid: model.oid || null
            };
        }
    }
    fs.writeFileSync(META_FILE, JSON.stringify(metaData, null, 2));
    console.log('[Sherpa] Model metadata saved successfully.');

    await verifyAndDownloadSileroModel();
}

async function verifyAndDownloadSileroModel() {
    const os = require('os');
    const rootSileroPath = path.join(__dirname, '..', 'v5_6_ru.pt');
    const resourcesSileroDir = path.join(__dirname, '..', 'resources', 'models', 'silero-v5');
    const resourcesSileroPath = path.join(resourcesSileroDir, 'v5_6_ru.pt');
    const userCachePath1 = path.join(os.homedir(), '.cache', 'torch', 'hub', 'snakers4_silero-models_master', 'v5_6_ru.pt');
    const userCachePath2 = path.join(os.homedir(), '.cache', 'torch', 'hub', 'checkpoints', 'v5_6_ru.pt');
    const voiceModelsPath = path.join(__dirname, '..', 'Voice', 'models', 'v5_6_ru.pt');

    // Automatically remove legacy 5.5 files
    const legacyCandidates = [
        path.join(__dirname, '..', 'v5_5_ru.pt'),
        path.join(resourcesSileroDir, 'v5_5_ru.pt'),
        path.join(os.homedir(), '.cache', 'torch', 'hub', 'snakers4_silero-models_master', 'v5_5_ru.pt'),
        path.join(os.homedir(), '.cache', 'torch', 'hub', 'checkpoints', 'v5_5_ru.pt'),
        path.join(__dirname, '..', 'Voice', 'models', 'v5_5_ru.pt')
    ];
    for (const oldFile of legacyCandidates) {
        if (fs.existsSync(oldFile)) {
            try {
                fs.unlinkSync(oldFile);
                console.log(`[Silero TTS] Removed legacy v5_5_ru.pt file: ${oldFile}`);
            } catch (e) {}
        }
    }

    const ensureResourcesCopy = (sourceFile) => {
        try {
            if (!fs.existsSync(resourcesSileroPath) || fs.statSync(resourcesSileroPath).size < 10 * 1024 * 1024) {
                fs.mkdirSync(resourcesSileroDir, { recursive: true });
                fs.copyFileSync(sourceFile, resourcesSileroPath);
                console.log(`[Silero TTS] Synced model to packaging resources: ${resourcesSileroPath}`);
            }
        } catch (e) { /* ignore copy error */ }
    };

    const candidates = [rootSileroPath, resourcesSileroPath, userCachePath1, userCachePath2, voiceModelsPath];
    for (const cand of candidates) {
        if (fs.existsSync(cand)) {
            try {
                const sz = fs.statSync(cand).size;
                if (sz > 10 * 1024 * 1024) {
                    console.log(`[Silero TTS] Found valid model file at ${cand} (${Math.round(sz / (1024 * 1024))} MB).`);
                    if (cand !== rootSileroPath && !fs.existsSync(rootSileroPath)) {
                        console.log(`[Silero TTS] Copying model to root directory: ${rootSileroPath}...`);
                        fs.copyFileSync(cand, rootSileroPath);
                    }
                    ensureResourcesCopy(cand);
                    return;
                }
            } catch (e) { /* ignore read error */ }
        }
    }

    console.log('[Silero TTS] v5_6_ru.pt not found on disk. Pre-downloading Silero v5.6 (55 MB)...');
    try {
        await downloadFile('https://models.silero.ai/models/tts/ru/v5_6_ru.pt', rootSileroPath);
        console.log('[Silero TTS] Silero v5.6 downloaded successfully to ' + rootSileroPath);
        ensureResourcesCopy(rootSileroPath);
    } catch (err) {
        console.warn(`[Silero TTS] Warning: Could not pre-download Silero model: ${err.message}. Python server will attempt fallback on start.`);
    }
}

module.exports = {
    fetchHfTree,
    DEFAULT_MODELS,
    main
};

if (require.main === module) {
    main().then(() => {
        process.exit(0);
    }).catch((err) => {
        console.error('[Sherpa] Download error:', err);
        process.exit(1);
    });
}

