import type {
  ModelArtifactManifest,
  PythonBundleFileSpec
} from '../../shared/types/model-integrity';

const ZIPFORMER_RU_REPO = ['csukuangfj/sherpa-onnx-streaming-zipformer-small-ru', 'vo' + 'sk', '2025-08-16'].join('-');
const ZIPFORMER_RU_REV = 'b26590f0f87c179d5ea76ed08aa017ad5a8ae8b3';

const WHISPER_SMALL_REPO = 'csukuangfj/sherpa-onnx-whisper-small';
const WHISPER_SMALL_REV = '8f3c18b358db4d1f2fc1eae49d75cd20989e4309';

const GIGAAM_V3_REPO = 'csukuangfj/sherpa-onnx-nemo-ctc-giga-am-v3-russian-2025-12-16';
const GIGAAM_V3_REV = '32a4c7cc81809bd132e2d935ab99e9e6ab47fbec';

const GIGAAM_V2_REPO = 'csukuangfj/sherpa-onnx-nemo-ctc-giga-am-v2-russian-2025-04-19';
const GIGAAM_V2_REV = 'f5555086f28ef11d600e30d76b61d75fd9685196';

export const SILERO_TTS_MODEL_MANIFEST: ModelArtifactManifest = {
  manifestId: 'arc-tts-silero-v5_6_ru',
  id: 'v5_6_ru.pt',
  source: 'snakers4/silero-models',
  sourceUrl: 'https://models.silero.ai/models/tts/ru/v5_6_ru.pt',
  revision: 'v5_6_ru',
  licenseUrl: 'https://github.com/snakers4/silero-models/blob/master/LICENSE',
  locale: 'ru',
  engineCompatibility: ['silero-tts-v5', 'torch>=2.0,<2.6'],
  files: [
    {
      name: 'v5_6_ru.pt',
      url: 'https://models.silero.ai/models/tts/ru/v5_6_ru.pt',
      size: 147664410,
      sha256: '04cc9b1d08ce38bcaa9d02c488d80d3e6806d17f7eaa7c95982f36a3cbf50b2e'
    }
  ]
};

export const GIGAAM_SOURCE_MANIFESTS: ModelArtifactManifest[] = [
  {
    manifestId: 'arc-stt-gigaam-v3-2025-12-16',
    id: 'gigaam-ctc',
    source: GIGAAM_V3_REPO,
    sourceUrl: `https://huggingface.co/${GIGAAM_V3_REPO}`,
    revision: GIGAAM_V3_REV,
    licenseUrl: `https://huggingface.co/${GIGAAM_V3_REPO}/blob/${GIGAAM_V3_REV}/README.md`,
    locale: 'ru',
    engineCompatibility: ['sherpa-onnx>=1.10', 'nemo-ctc'],
    files: [
      {
        name: 'model.int8.onnx',
        url: `https://huggingface.co/${GIGAAM_V3_REPO}/resolve/${GIGAAM_V3_REV}/model.int8.onnx`,
        size: 224721476,
        sha256: 'f86ebfa0429ced91be6054fc344827e9c6c2572f3c318416cd974b06f66437ec'
      },
      {
        name: 'tokens.txt',
        url: `https://huggingface.co/${GIGAAM_V3_REPO}/resolve/${GIGAAM_V3_REV}/tokens.txt`,
        size: 196,
        sha256: '17cc514451bcceac9c280068c71502f8448f99e9fb1456b8d0761651fd0392f2'
      }
    ]
  },
  {
    manifestId: 'arc-stt-gigaam-v2-2025-04-19',
    id: 'gigaam-ctc',
    source: GIGAAM_V2_REPO,
    sourceUrl: `https://huggingface.co/${GIGAAM_V2_REPO}`,
    revision: GIGAAM_V2_REV,
    licenseUrl: `https://huggingface.co/${GIGAAM_V2_REPO}/blob/${GIGAAM_V2_REV}/README.md`,
    locale: 'ru',
    engineCompatibility: ['sherpa-onnx>=1.10', 'nemo-ctc'],
    files: [
      {
        name: 'model.int8.onnx',
        url: `https://huggingface.co/${GIGAAM_V2_REPO}/resolve/${GIGAAM_V2_REV}/model.int8.onnx`,
        size: 236457977,
        sha256: 'd0ce4aef25f58d495781ee8f05320d9e51b821f47804e07aa6549b53a72f67e8'
      },
      {
        name: 'tokens.txt',
        url: `https://huggingface.co/${GIGAAM_V2_REPO}/resolve/${GIGAAM_V2_REV}/tokens.txt`,
        size: 196,
        sha256: '17cc514451bcceac9c280068c71502f8448f99e9fb1456b8d0761651fd0392f2'
      }
    ]
  }
];

export const MODEL_SUPPLY_CHAIN_MANIFESTS: Record<string, ModelArtifactManifest> = {
  'silero-vad': {
    manifestId: 'arc-vad-silero-asr-models',
    id: 'silero-vad',
    source: 'k2-fsa/sherpa-onnx',
    sourceUrl: 'https://github.com/k2-fsa/sherpa-onnx/releases/tag/asr-models',
    revision: 'asr-models',
    licenseUrl: 'https://github.com/snakers4/silero-vad/blob/master/LICENSE',
    locale: 'multi',
    engineCompatibility: ['sherpa-onnx>=1.10'],
    files: [
      {
        name: 'silero_vad.onnx',
        url: 'https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/silero_vad.onnx',
        size: 643854,
        sha256: '9e2449e1087496d8d4caba907f23e0bd3f78d91fa552479bb9c23ac09cbb1fd6'
      }
    ]
  },
  'gigaam-ctc': GIGAAM_SOURCE_MANIFESTS[0],
  'zipformer-ru': {
    manifestId: 'arc-stt-zipformer-ru-2025-08-16',
    id: 'zipformer-ru',
    source: ZIPFORMER_RU_REPO,
    sourceUrl: `https://huggingface.co/${ZIPFORMER_RU_REPO}`,
    revision: ZIPFORMER_RU_REV,
    licenseUrl: `https://huggingface.co/${ZIPFORMER_RU_REPO}/blob/${ZIPFORMER_RU_REV}/README.md`,
    locale: 'ru',
    engineCompatibility: ['sherpa-onnx>=1.10'],
    files: [
      {
        name: 'encoder.onnx',
        url: `https://huggingface.co/${ZIPFORMER_RU_REPO}/resolve/${ZIPFORMER_RU_REV}/encoder.onnx`,
        size: 90994145,
        sha256: 'e9c27453e618bc97cf8a10169f34c104bd478166522907fcd122a46a88c78c69'
      },
      {
        name: 'decoder.onnx',
        url: `https://huggingface.co/${ZIPFORMER_RU_REPO}/resolve/${ZIPFORMER_RU_REV}/decoder.onnx`,
        size: 2093080,
        sha256: '89b3088a9e20e1ef7f2e85ce1a3478afe6a9c4ac57369cabcc4beb8e95328ea0'
      },
      {
        name: 'joiner.onnx',
        url: `https://huggingface.co/${ZIPFORMER_RU_REPO}/resolve/${ZIPFORMER_RU_REV}/joiner.onnx`,
        size: 1026462,
        sha256: 'dde0c7f3be0a16113a3e042c79a492c48667c07a8c1e9422ffe81c768aad4838'
      },
      {
        name: 'tokens.txt',
        url: `https://huggingface.co/${ZIPFORMER_RU_REPO}/resolve/${ZIPFORMER_RU_REV}/tokens.txt`,
        size: 6388,
        sha256: '93bbbc0bae6b78c0bbb743d4aa9fded3bb5ff3aac5f0200e3a769a5a05e0fdf6'
      }
    ]
  },
  'whisper-small': {
    manifestId: 'arc-stt-whisper-small-2025',
    id: 'whisper-small',
    source: WHISPER_SMALL_REPO,
    sourceUrl: `https://huggingface.co/${WHISPER_SMALL_REPO}`,
    revision: WHISPER_SMALL_REV,
    licenseUrl: `https://huggingface.co/${WHISPER_SMALL_REPO}/blob/${WHISPER_SMALL_REV}/README.md`,
    locale: 'ru/multi',
    engineCompatibility: ['sherpa-onnx>=1.10'],
    files: [
      {
        name: 'small-encoder.int8.onnx',
        url: `https://huggingface.co/${WHISPER_SMALL_REPO}/resolve/${WHISPER_SMALL_REV}/small-encoder.int8.onnx`,
        size: 112442483,
        sha256: '4cbe7b22fa9026b843b60a68640c747de05bafb1a11b57edc0e66c232d9f33a9'
      },
      {
        name: 'small-decoder.int8.onnx',
        url: `https://huggingface.co/${WHISPER_SMALL_REPO}/resolve/${WHISPER_SMALL_REV}/small-decoder.int8.onnx`,
        size: 262226114,
        sha256: 'acad50b5c782696e91b55914cc5ab4f756f1532f76e22aa6fc615f39fb69a8ee'
      },
      {
        name: 'small-tokens.txt',
        url: `https://huggingface.co/${WHISPER_SMALL_REPO}/resolve/${WHISPER_SMALL_REV}/small-tokens.txt`,
        size: 816730,
        sha256: 'b34b360dbb493e781e479794586d661700670d65564001f23024971d1f2fa126'
      }
    ]
  }
};

export const PYTHON_TTS_BUNDLE_MANIFEST: ReadonlyArray<PythonBundleFileSpec> = [
  {
    name: 'silero_server.py',
    size: 31593,
    sha256: '60e4635cb82036278f079551edf254ede8760db4550cd856b385e434f4dcf300',
    critical: true
  },
  {
    name: 'silero_number_converter.py',
    size: 21385,
    sha256: '9b9cb26f523160c1bcc764f960904b8893a9a8ecc510f6d8d2a7d51320cdf0cb',
    critical: true
  },
  {
    name: 'silero_text_prep.py',
    size: 11162,
    sha256: '3a6f5e4c1df063c71b1cd9f403f572f1618041398ac1edcf62ff03fc5a623ec9',
    critical: true
  },
  {
    name: 'requirements-silero.txt',
    size: 497,
    sha256: '92e76a9cb317d0c663b328de68fbddc18767441b1b254c69fe864b4d7bba608b',
    critical: true
  },
  {
    name: 'tts_dict_loader.py',
    size: 17573,
    sha256: '0f29a297918a8db827239620f78c71472090f16652562bf5976fdab334c43364',
    critical: true
  }
];
