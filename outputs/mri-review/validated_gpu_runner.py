"""Retain the existing verified GPU import bootstrap; use the shared strict worker."""
import argparse, json, sys, os, importlib.util, hashlib
from pathlib import Path
parser=argparse.ArgumentParser()
parser.add_argument('--job',required=True,type=Path)
parser.add_argument('--weights',required=True,type=Path)
parser.add_argument('--model',choices=['segresnet'],default='segresnet')
args=parser.parse_args()
try:
    os.environ['CUBLAS_WORKSPACE_CONFIG']=':4096:8'
    project=Path(__file__).resolve().parents[2]
    folder=project/'outputs/brainlens-segresnet-context-training-profile'
    spec=importlib.util.spec_from_file_location('validated_website_runtime',folder/'worker.py')
    helper=importlib.util.module_from_spec(spec);spec.loader.exec_module(helper)
    stage=helper.read(folder/'stage.json')
    # The historical worker remains byte-for-byte intact, so every frozen
    # binding is verified normally. The upgraded worker has its own provenance.
    helper.verify(stage)
    torch,_,_,packages,_=helper.imports(stage)
    if not torch.cuda.is_available():raise ValueError('The configured CUDA device is unavailable; no inference was performed.')
    torch.use_deterministic_algorithms(True);torch.backends.cudnn.benchmark=False;torch.backends.cudnn.deterministic=True
    torch.backends.cudnn.allow_tf32=False;torch.backends.cuda.matmul.allow_tf32=False
    from validated_model_runner import run
    run(args.job,args.weights,args.model,device='cuda',runtime_provenance={'packageVersions':{k:v['version'] for k,v in packages.items()},'historicalRecordUnmodified':True,'allFrozenBindingsVerified':True,'frozenStageSha256':helper.sha(folder/'stage.json'),'bindingHelperSha256':helper.sha(folder/'worker.py'),'gpuWrapperSha256':helper.sha(Path(__file__))})
except Exception as error:
    import traceback
    traceback.print_exc()
    # The service also records spawn/bootstrap failures when no error file exists.
    if 'args' in globals():
        target=args.job/'error.json'
        if not target.exists():target.write_text(json.dumps({'error':str(error) if isinstance(error,ValueError) else f'Model execution failed ({type(error).__name__}); no verified result is available.','errorType':type(error).__name__}))
    sys.exit(1)
