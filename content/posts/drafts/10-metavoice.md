# metavoice

- you need cuda support
- if you have no cuda support you get compile errors and no working server

## cuda on nix

```sh

  environment.systemPackages = with pkgs; [
    nvidia-container-toolkit
    cudatoolkit
  ];
  hardware.nvidia-container-toolkit.enable = true;
  hardware.nvidia-container-toolkit.mount-nvidia-executables = true;
  hardware.nvidia.package = config.boot.kernelPackages.nvidiaPackages.beta;
```

check if on server nvidia run correctly

```sh
nvidia-smi

+-----------------------------------------------------------------------------------------+
| NVIDIA-SMI 550.78                 Driver Version: 550.78         CUDA Version: 12.4     |
|-----------------------------------------+------------------------+----------------------+
| GPU  Name                 Persistence-M | Bus-Id          Disp.A | Volatile Uncorr. ECC |
| Fan  Temp   Perf          Pwr:Usage/Cap |           Memory-Usage | GPU-Util  Compute M. |
|                                         |                        |               MIG M. |
|=========================================+========================+======================|
|   0  NVIDIA GeForce RTX 4090        Off |   00000000:0E:00.0  On |                  Off |
|  0%   43C    P2             54W /  450W |   18131MiB /  24564MiB |      0%      Default |
|                                         |                        |                  N/A |
+-----------------------------------------+------------------------+----------------------+

+-----------------------------------------------------------------------------------------+
| Processes:                                                                              |
|  GPU   GI   CI        PID   Type   Process name                              GPU Memory |
|        ID   ID                                                               Usage      |
|=========================================================================================|
|    0   N/A  N/A      1765      G   ...iz78r52md-xorg-server-21.1.13/bin/X        288MiB |
|    0   N/A  N/A      1880      G   ...seed-version=20241006-180150.222000         62MiB |
|    0   N/A  N/A      2495      G   ...erProcess --variations-seed-version        115MiB |
|    0   N/A  N/A     78246      G   alacritty                                      15MiB |
|    0   N/A  N/A     78686      C   /app/.venv/bin/python                        8600MiB |
|    0   N/A  N/A     78765      C   /app/.venv/bin/python                        9004MiB |
|    0   N/A  N/A     84675      G   alacritty                                      15MiB |
+-----------------------------------------------------------------------------------------
```

then generate the cdi mapping for your card.

```sh
sudo nvidia-ctk cdi generate --output=/etc/cdi/nvidia.yaml # need to be in /etc/cdi
nvidia-ctk cdi list # list your mapping
```

```text
INFO[0000] Found 2 CDI devices
nvidia.com/gpu=0
nvidia.com/gpu=all
```

```sh
podman run --rm --device nvidia.com/gpu=all --security-opt=label=disable ubuntu nvidia-smi -L # check if the container has access
```

you dont need nvidia-smi installed, this will be [handled by cdi](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/cdi-support.html)
then you must check your docker-compose file if you have the device section.

```yaml
# podman run --rm --device nvidia.com/gpu=all --security-opt=label=disable ubuntu nvidia-smi -L
version: '3.8'
services:
  resource_test: # this is not working
    image: ubuntu:20.04
    devices:
      - nvidia.com/gpu=all
    security_opt:
      - label:disable
    tty: true
    stdin_open: true
    command:
      - bash
      - -c
      - nvidia-smi
```

attention: dont set the NVIDIA_VISIBLE_DEVICES env var if you use cdi.

```txt
Using CDI to inject NVIDIA devices can conflict with using the NVIDIA Container Runtime hook. This means that if a /usr/share/containers/oci/hooks.d/oci-nvidia-hook.json file exists, delete it or ensure that you do not run containers with the NVIDIA_VISIBLE_DEVICES environment variable set.
```

## run inside metavoice-server

```sh
podman run -it --rm --device nvidia.com/gpu=all --security-opt=label=disable --entrypoint /bin/bash 12eba4ef06ae

poetry run python -i fam/llm/fast_inference.py
tts.synthesise(text="This is a demo of text to speech by MetaVoice-1B, an open-source foundational audio model.", spk_ref_path="assets/bria.mp3")

```

## finetune eneral

```sh
# expect a "|"-delimited CSV dataset
# audio_files|captions
#./data/audio.wav|./data/caption.txt

# train
poetry run finetune --train ./datasets/sample_dataset.csv --val ./datasets/sample_val_dataset.csv
# use it
poetry run python -i fam/llm/fast_inference.py --first_stage_path ./my-finetuned_model.pt
```

## finetune in german

[dataset project](https://opendata.iisys.de/dataset/hui-audio-corpus-german/)
[dataset other clean](https://opendata.iisys.de/opendata/Datasets/HUI-Audio-Corpus-German/dataset_clean/others_Clean.zip)
[dataset repo](https://github.com/iisys-hof/HUI-Audio-Corpus-German)
[expl video](https://www.youtube.com/watch?v=r7BLbwxuJwk)
[colab](https://colab.research.google.com/drive/1ob-Q_9kJvH0F2pJ_JoWaIV9doGTsehV7#scrollTo=15uTrv0_wqn1)
[japanese training](https://github.com/kotoba-tech/kotoba-speech-release)

```sh
curl https://opendata.iisys.de/opendata/Datasets/HUI-Audio-Corpus-German/dataset_clean/others_Clean.zip -o dataset-others-clean.zip
unzip dataset-others-clean.zip -d dataset
```

todo: end here

then transform to ljspeech format

```sh
# format: dataset/<sample_name>.wav|transcription
from glob import glob
import csv

transcribed_audio_samples = []

for folder in glob("others_dataset/*"):
  for subfolder in glob(f"{folder}/*"):
    with open(f"{subfolder}/metadata.csv") as csv_file:
        audio_samples = csv.reader(csv_file, delimiter='\n')
        for audio_sample in audio_samples:
            transcribed_audio_sample = ''.join(audio_sample)
            filename, transcription = transcribed_audio_sample.split('|')
            new_transcribed_audio_sample = f"wavs/{filename}.wav|{transcription}"
            transcribed_audio_samples.append((f"{subfolder}/wavs/{filename}.wav", new_transcribed_audio_sample))
```

devide dataset into train and val subsets

```python
import random

random.shuffle(all_transcribed_audio_samples)
num_train_samples = int(len(all_transcribed_audio_samples) * 0.85)

train_dataset = transcribed_audio_samples[:num_train_samples]
val_dataset = transcribed_audio_samples[num_train_samples:]
```

```sh
mkdir dataset
mkdir dataset/wavs
```

```python
import shutil

train_val_list = [('train', train_dataset), ('val', val_dataset)]

for stage, dataset in train_val_list:
    sample_list = []
    for old_sample, new_sample in dataset:
        # copy audio sample to new location
        shutil.copyfile(old_sample, "./dataset/" + new_sample.split("|")[0])
        sample_list.append(new_sample)

    with open(f"./dataset/{stage}.txt", "w") as sample_file:
        sample_file.write("\n".join(sample_list))
```

packing

```sh
zip -r hui_audio_corpus.zip ./dataset
```

### finetune special letters

## rec your voice

- you need min. 30 seconds
- read some of [rapunzel](https://www.cs.cmu.edu/~spok/grimmtmp/009.txt)

```sh
arecord -l # get your input device
ffmpeg -f alsa -i hw:0 -t 60 out.wav
ffmpeg -i out.wav -filter:a "volume=1.5" output.wav # increase volume


ffmpeg -f alsa -sample_fmt s16 -ar 48000 -i hw:0 out.wav
ffmpeg -f alsa -sample_fmt pcm_s16le -sample_rate 48000 -i hw:0 out.wav # best qual.
```

## info

- [metavoice-live](https://github.com/metavoiceio/MetaVoiceLive)

### incompatible dependencies

```txt
ERROR: pip's dependency resolver does not currently take into account all the packages that are installed. This behaviour is the source of the following dependency conflicts.
audiocraft 1.2.0 requires torch==2.1.0, but you have torch 2.2.1 which is incompatible.
xformers 0.0.22.post7 requires torch==2.1.0, but you have torch 2.2.1 which is incompatible.

PyTorch 2.1.0+cu121 with CUDA 1201 (you have 2.2.1+cu121)
Python  3.10.13 (you have 3.10.12)
  Please reinstall xformers (see <https://github.com/facebookresearch/xformers#installing-xformers>)
```

don't worry, ignore it.
