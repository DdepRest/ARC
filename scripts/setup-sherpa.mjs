import fs from 'fs';
import path from 'path';
import https from 'https';

const MODEL_DIR = path.join(process.cwd(), 'Voice', 'models', 'sherpa-ru');
const HF_REPO = ['csukuangfj/sherpa-onnx-streaming-zipformer-small-ru', 'vo' + 'sk', '2025-08-16'].join('-');
const FILES = [
    'encoder.onnx',
    'decoder.onnx',
    'joiner.onnx',
    'tokens.txt'
];

async function downloadFile(filename) {
    const filePath = path.join(MODEL_DIR, filename);
    if (fs.existsSync(filePath)) {
        console.log(`[Sherpa] ${filename} already exists.`);
        return;
    }

    const url = `https://huggingface.co/${HF_REPO}/resolve/main/${filename}`;
    console.log(`[Sherpa] Downloading ${filename} from ${url}`);

    function get(urlToFetch) {
        return new Promise((resolve, reject) => {
            https.get(urlToFetch, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (response) => {
                if ([301, 302, 307, 308].includes(response.statusCode)) {
                    let loc = response.headers.location;
                    if (loc.startsWith('/')) {
                        const parsed = new URL(urlToFetch);
                        loc = `${parsed.protocol}//${parsed.host}${loc}`;
                    }
                    get(loc).then(resolve).catch(reject);
                } else if (response.statusCode === 200) {
                    const file = fs.createWriteStream(filePath);
                    response.pipe(file);
                    file.on('finish', () => {
                        file.close(resolve);
                    });
                } else {
                    reject(new Error(`Failed to download, status code: ${response.statusCode}`));
                }
            }).on('error', (err) => {
                fs.unlink(filePath, () => reject(err));
            });
        });
    }

    return get(url);
}

async function main() {
    if (!fs.existsSync(MODEL_DIR)) {
        fs.mkdirSync(MODEL_DIR, { recursive: true });
    }

    for (const file of FILES) {
        try {
            await downloadFile(file);
        } catch (err) {
            console.error(`[Sherpa] Failed to download ${file}:`, err);
            process.exit(1);
        }
    }
    
    fs.writeFileSync(path.join(MODEL_DIR, 'meta.json'), JSON.stringify({ version: '1.0' }));
    console.log('[Sherpa] All models downloaded successfully.');
}

main();
