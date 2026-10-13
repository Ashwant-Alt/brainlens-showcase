"""Local, CPU-only BRISC slice adapter. No downloads or fallback predictions."""
import argparse
import hashlib
import io
import json
import sys
import warnings
from pathlib import Path

CLASSES = ["glioma", "meningioma", "pituitary", "no_tumor"]
PREPROCESSING = {"id": "rgb224-bilinear-imagenet-v1", "width": 224, "height": 224,
                 "color": "RGB", "resize": "bilinear_warp", "scale": 255,
                 "mean": [0.485, 0.456, 0.406], "std": [0.229, 0.224, 0.225]}

def sha(data):
    return hashlib.sha256(data).hexdigest()

def load_slice(raw):
    from PIL import Image, ImageOps
    if not raw or len(raw) > 8 * 1024 * 1024:
        raise ValueError("Choose a JPEG or PNG slice no larger than 8 MB.")
    if not (raw.startswith(b"\x89PNG\r\n\x1a\n") or raw.startswith(b"\xff\xd8\xff")):
        raise ValueError("Only a 2D JPEG or PNG MRI slice is supported; NIfTI and DICOM belong in the 3D workflow.")
    Image.MAX_IMAGE_PIXELS = 4096 * 4096
    with warnings.catch_warnings():
        warnings.simplefilter("error", Image.DecompressionBombWarning)
        with Image.open(io.BytesIO(raw)) as check:
            if check.format not in ("JPEG", "PNG") or getattr(check, "n_frames", 1) != 1:
                raise ValueError("A single-frame JPEG or PNG is required.")
            if not all(32 <= size <= 4096 for size in check.size):
                raise ValueError("Slice dimensions must be between 32 and 4096 pixels.")
            if check.mode not in ("L", "RGB"):
                raise ValueError("Use an 8-bit grayscale or RGB slice without transparency.")
            fmt, size = check.format, check.size
            check.verify()
        with Image.open(io.BytesIO(raw)) as image:
            if image.getexif().get(274, 1) not in (None, 1):
                raise ValueError("EXIF-rotated slices need an explicitly prepared research copy.")
            image.load()
            rgb = ImageOps.exif_transpose(image).convert("RGB")
            extremes = rgb.getextrema()
            if all(low == high for low, high in extremes):
                raise ValueError("The slice is constant-valued and cannot be classified.")
            return rgb.copy(), fmt, size

def tensor_for(image):
    import numpy as np
    import torch
    from PIL import Image
    resized = image.resize((224, 224), Image.Resampling.BILINEAR)
    array = np.asarray(resized, dtype=np.float32) / 255.0
    tensor = torch.from_numpy(array.copy()).permute(2, 0, 1).unsqueeze(0)
    mean = torch.tensor(PREPROCESSING["mean"]).view(1, 3, 1, 1)
    std = torch.tensor(PREPROCESSING["std"]).view(1, 3, 1, 1)
    tensor = (tensor - mean) / std
    if tensor.shape != (1, 3, 224, 224) or not torch.isfinite(tensor).all():
        raise ValueError("Invalid preprocessed slice.")
    return tensor

def run(job, bundle_path):
    import torch
    torch.set_num_threads(1)
    torch.use_deterministic_algorithms(True)
    bundle_bytes = bundle_path.read_bytes()
    bundle = json.loads(bundle_bytes)
    if (bundle.get("format") != "torchscript" or bundle.get("classes") != CLASSES
            or bundle.get("preprocessing") != PREPROCESSING
            or bundle.get("weightsFile") != "classifier.ts"
            or bundle.get("evaluationFile") != "evaluation.json"):
        raise ValueError("Checkpoint class mapping or preprocessing is unsupported.")
    # Hash the same in-memory bytes subsequently loaded, closing file races.
    weights_path = bundle_path.parent / "classifier.ts"
    if weights_path.stat().st_size > 256 * 1024 * 1024:
        raise ValueError("Checkpoint exceeds this bounded CPU adapter's 256 MB limit.")
    weights = weights_path.read_bytes()
    evaluation = (bundle_path.parent / "evaluation.json").read_bytes()
    if sha(weights) != bundle.get("weightsSHA256") or sha(evaluation) != bundle.get("evaluationSHA256"):
        raise ValueError("Checkpoint or evaluation checksum mismatch.")
    raw = (job / "input-image").read_bytes()
    image, fmt, size = load_slice(raw)
    tensor = tensor_for(image)
    model = torch.jit.load(io.BytesIO(weights), map_location="cpu").eval()
    with torch.inference_mode():
        logits = model(tensor)
    if not isinstance(logits, torch.Tensor) or tuple(logits.shape) != (1, 4) or not torch.isfinite(logits).all():
        raise ValueError("Classifier must return four finite logits for one slice.")
    scores = torch.softmax(logits.float(), dim=1)[0].tolist()
    if any(not 0 <= score <= 1 for score in scores):
        raise ValueError("Classifier returned invalid scores.")
    result = {"topClass": CLASSES[max(range(4), key=lambda i: scores[i])],
              "scores": dict(zip(CLASSES, scores)), "width": size[0], "height": size[1], "format": fmt,
              "inputSHA256": sha(raw), "weightsSHA256": sha(weights), "bundleSHA256": sha(bundle_bytes),
              "evaluationSHA256": sha(evaluation), "runnerSHA256": sha(Path(__file__).read_bytes()),
              "runtime": {"python": sys.version.split()[0], "torch": torch.__version__, "device": "cpu"}}
    with (job / "worker-result.json").open("x", encoding="utf-8") as handle:
        json.dump(result, handle, allow_nan=False)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--probe", action="store_true")
    parser.add_argument("--job", type=Path)
    parser.add_argument("--bundle", type=Path)
    args = parser.parse_args()
    if args.probe:
        import torch
        import PIL
        import numpy
        print(json.dumps({"torch": torch.__version__, "pillow": PIL.__version__, "numpy": numpy.__version__, "device": "cpu"}))
        return
    if not args.job or not args.bundle:
        parser.error("--job and --bundle are required")
    try:
        run(args.job, args.bundle)
    except Exception as error:
        # Fixed filename, no caller filename or external service.
        with (args.job / "error.json").open("x", encoding="utf-8") as handle:
            json.dump({"error": str(error)}, handle)
        raise SystemExit(1)

if __name__ == "__main__":
    main()
