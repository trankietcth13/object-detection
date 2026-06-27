# Capstone 2 — Object Detection & Object Recognition (Scene Text, ICDAR 2003)

**Author:** Tran Tuan Kiet ·
**Instructor:** Mr. Nguyen Viet An

A system that **reads text in natural-scene images** (Scene Text Reading), made of the two tasks required by the brief:

| Task | Question | Model | Output |
|---|---|---|---|
| **Object Detection** | "Where is the text?" | **YOLOv8n** (fine-tuned) | a bounding box around each word |
| **Object Recognition** | "What text is in this region?" | **CRNN + CTC** | a character string (e.g. `CARLING` → `carling`) |

Combined into a pipeline: **image → YOLO finds the boxes → crop → CRNN reads → display**.

---

## 1. Folder structure
```
Capstone2/
├── Capstone2_Object_Detection_Recognition_ICDAR2003.ipynb   # Main notebook (runs on Colab)
├── TranTuanKiet_Capstone2_Report.docx   # Formal REPORT (mirrors the Capstone 1 structure)
├── app.py                # Streamlit UI (Detect + Recognize)
├── requirements.txt      # Required libraries
├── weights/              # Trained weights: yolo_text.pt, crnn_best.pth
├── figures/              # EDA/result figures + metrics.json (real numbers)
└── README.md             # This file
```
When the notebook runs on Colab, the weights are saved to `/content/capstone2/artifacts/`
(`yolo_text.pt`, `crnn_best.pth`, `app.py`). Pre-trained weights are provided in `weights/`.

## 2. Dataset — ICDAR 2003 (`SceneTrialTrain`)
- Downloaded automatically from Google Drive (ID `1pvr84v_HLKbkZMaSJ7-G-7SsnxegG5YO`) inside the notebook.
- 258 scene images (250 annotated), **1156 word boxes**, 789 unique words.
- Annotation `words.xml`: each word has `x, y, width, height` + `<tag>` (the text content).
- Shared by both tasks: boxes → Detection; crops + tag → Recognition.

## 3. Method

### 3.1 Object Detection — YOLOv8
- Convert the annotation → YOLO format (normalised `class cx cy w h`), single class `text`.
- Split train/val 80/20 **by image** (to avoid data leakage).
- Fine-tune `yolov8n.pt` (~60 epochs, imgsz 640).
- Metrics: **Precision, Recall, mAP@0.5, mAP@0.5:0.95**.

### 3.2 Object Recognition — CRNN + CTC (core task)
- Crop boxes → grayscale → resize **32×100** → normalise to [-1,1]; labels lower-cased `[a-z0-9]` (ICDAR 36-class convention).
- Architecture: **7-layer CNN** (squeezes the height to 1, producing a T=26-column sequence) → **BiLSTM ×2** → Linear 37 classes (36 chars + blank).
- **Synthetic data:** only ~974 real crops is far too few (real-only training reaches ~4% accuracy). Following the
  standard MJSynth/SynthText practice, each epoch generates **7000 synthetic word images** (rendered from ~24 system
  fonts with random colour/noise/rotation) **mixed with the real data**. The model is still **evaluated on the REAL ICDAR val set**.
- Trained with the **CTC loss** (no character-to-column alignment needed); greedy decoding (drop repeats + drop blank).
- Metrics: **Word Accuracy** and **Character Error Rate (CER)**.

## 3b. Real results (run on an RTX 4060)
| Model | Metric | Value |
|---|---|---|
| YOLOv8n (Detection) | Precision / Recall | 0.834 / 0.783 |
| YOLOv8n (Detection) | **mAP@0.5** / mAP@0.5:0.95 | **0.820** / 0.638 |
| CRNN+CTC (Recognition) | **Word Accuracy** (real val) | **0.523** |
| CRNN+CTC (Recognition) | **CER** (real val) | **0.245** |

> On a Colab T4 the numbers may vary slightly due to the randomness of the synthetic data.

## 4. How to run

### A) On Google Colab (recommended — has a GPU)
1. Upload `Capstone2_Object_Detection_Recognition_ICDAR2003.ipynb` to Colab.
2. `Runtime → Change runtime type → T4 GPU`.
3. `Runtime → Run all`. The notebook automatically: installs libraries → downloads the dataset → EDA → trains Detection → trains Recognition → evaluates → builds the UI.
4. The last cell prints a **localtunnel** link to open Streamlit (the password = the IP shown).

### B) Run Streamlit locally (once you have the weights)
```bash
pip install -r requirements.txt
# place yolo_text.pt and crnn_best.pth in the same folder as app.py
streamlit run app.py
```
The app has 2 modes: **Full image** (Detect + Recognize) and **Cropped word** (Recognize only).

## 5. Brief requirements → where they are implemented
| Requirement | Location in the notebook |
|---|---|
| Load the ICDAR 2003 dataset | Step 2.4 |
| Process data, Dataset & DataLoader | Steps 3, 6.1, 7.2–7.4 |
| Design the recognition model (Recognition) | Step 7.5 (CRNN) |
| (Extension) Detection model | Step 6.3 (YOLOv8) |
| Integrate a Streamlit application | Step 9 + `app.py` |

## 6. Limitations & future work
- Small dataset (~1156 boxes) → even with synthetic data the model memorises the real training set (train acc 1.0), so a train–val gap remains.
- Synthetic data uses clean fonts → a domain gap from real text (textured backgrounds, unusual fonts). Upgrade: SynthText (real backgrounds, more fonts).
- Recognition follows the ICDAR convention: case-insensitive, punctuation removed.
- Other upgrades: an attention decoder instead of CTC; YOLOv8s/m for Detection; a dictionary/language post-processing step to fix single-character errors (e.g. good→cood).

## 7. References
- Shi, Bai, Yao (2015) — *CRNN*. · Graves et al. (2006) — *CTC*. · Ultralytics *YOLOv8*. · ICDAR 2003 Robust Reading.
