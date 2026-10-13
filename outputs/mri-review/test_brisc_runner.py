"""Synthetic software fixtures only; no MRI evidence or trained detector."""
import io
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
import torch
from PIL import Image
from brisc_runner import CLASSES, PREPROCESSING, load_slice, tensor_for, sha

class FixtureClassifier(torch.nn.Module):
    def forward(self, x):
        # Deterministic test computation; this is not a trained tumour model.
        value = x.mean(dim=(1, 2, 3))
        return torch.stack((value, value + 1, value - 1, value + 2), dim=1)

def image_bytes():
    image = Image.new("L", (64, 80))
    image.putdata([(x * 7 + y * 3) % 256 for y in range(80) for x in range(64)])
    stream = io.BytesIO()
    image.save(stream, format="PNG")
    return stream.getvalue()

def make_fixture(directory):
    directory.mkdir(parents=True, exist_ok=False)
    torch.jit.script(FixtureClassifier()).save(str(directory / "classifier.ts"))
    checkpoint_hash = sha((directory / "classifier.ts").read_bytes())
    evaluation = {"schemaVersion": 1, "dataset": "BRISC2025", "inputUnit": "slice",
                  "modelSHA256": checkpoint_hash, "sampleCount": 1, "heldOut": True,
                  "patientIndependence": "not_established", "methodology": "SYNTHETIC SOFTWARE FIXTURE ONLY, not a BRISC evaluation",
                  "metrics": {"syntheticFixture": True}}
    evaluation_bytes = json.dumps(evaluation).encode()
    (directory / "evaluation.json").write_bytes(evaluation_bytes)
    bundle = {"schemaVersion": 1, "modelId": "brisc-slice-v1", "task": "slice_classification",
              "inputUnit": "slice", "spatialDimensions": 2, "outputUnit": "slice", "dataset": "BRISC2025",
              "format": "torchscript", "classes": CLASSES, "preprocessing": PREPROCESSING,
              "weightsFile": "classifier.ts", "weightsSHA256": checkpoint_hash,
              "evaluationFile": "evaluation.json", "evaluationSHA256": sha(evaluation_bytes),
              "checkpointSource": "Synthetic software fixture, never enable in production",
              "licence": "Synthetic test fixture", "trainingPreprocessingSource": "Synthetic test, no training"}
    (directory / "bundle.json").write_text(json.dumps(bundle), encoding="utf-8")
    (directory / "synthetic.png").write_bytes(image_bytes())

class SliceTests(unittest.TestCase):
    def test_preprocessing_shape_finite_and_exact_normalization(self):
        image, fmt, size = load_slice(image_bytes())
        tensor = tensor_for(image)
        self.assertEqual(size, (64, 80))
        self.assertEqual(fmt, "PNG")
        self.assertEqual(tuple(tensor.shape), (1, 3, 224, 224))
        self.assertTrue(torch.isfinite(tensor).all())
        # Independently reconstruct one resized pixel per channel.
        pixel = image.resize((224, 224), Image.Resampling.BILINEAR).getpixel((17, 31))
        for channel in range(3):
            expected = (pixel[channel] / 255.0 - PREPROCESSING["mean"][channel]) / PREPROCESSING["std"][channel]
            self.assertAlmostEqual(tensor[0, channel, 31, 17].item(), expected, places=5)

    def test_invalid_truncated_and_volumetric_files_are_rejected(self):
        for raw in [b"n+1\0", b"DICM", image_bytes()[:30], b""]:
            with self.assertRaises(Exception):
                load_slice(raw)

    def test_constant_too_small_and_alpha_images_are_rejected(self):
        for image in [Image.new("L", (64, 64), 3), Image.new("L", (4, 4)), Image.new("RGBA", (64, 64))]:
            stream = io.BytesIO()
            image.save(stream, format="PNG")
            with self.assertRaises(ValueError):
                load_slice(stream.getvalue())

    def test_actual_torchscript_forward_and_failure_has_no_prediction(self):
        with tempfile.TemporaryDirectory(prefix="brainlens-brisc-synthetic-") as temporary:
            root = Path(temporary)
            make_fixture(root / "bundle")
            job = root / "job"
            job.mkdir()
            (job / "input-image").write_bytes(image_bytes())
            command = [sys.executable, "-B", str(Path(__file__).with_name("brisc_runner.py")), "--job", str(job), "--bundle", str(root / "bundle/bundle.json")]
            completed = subprocess.run(command, capture_output=True, timeout=30)
            self.assertEqual(completed.returncode, 0, completed.stderr.decode())
            result = json.loads((job / "worker-result.json").read_text())
            self.assertEqual(result["topClass"], "no_tumor")
            self.assertAlmostEqual(sum(result["scores"].values()), 1, places=5)
            self.assertEqual(result["inputSHA256"], sha(image_bytes()))
            bad_job = root / "bad-job"
            bad_job.mkdir()
            (bad_job / "input-image").write_bytes(b"invalid")
            command[command.index("--job") + 1] = str(bad_job)
            failed = subprocess.run(command, capture_output=True, timeout=30)
            self.assertNotEqual(failed.returncode, 0)
            self.assertTrue((bad_job / "error.json").exists())
            self.assertFalse((bad_job / "worker-result.json").exists())

if __name__ == "__main__":
    if len(sys.argv) == 3 and sys.argv[1] == "--make-fixture":
        make_fixture(Path(sys.argv[2]))
    else:
        unittest.main()
