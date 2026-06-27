// UI Elements
const systemStatus = document.getElementById('systemStatus');
const statusText = systemStatus.querySelector('.status-text');
const statusIndicator = systemStatus.querySelector('.status-indicator');

const yoloBadge = document.getElementById('yoloBadge');
const yoloProgress = document.getElementById('yoloProgress');
const cocoBadge = document.getElementById('cocoBadge');
const cocoProgress = document.getElementById('cocoProgress');
const crnnBadge = document.getElementById('crnnBadge');
const crnnProgress = document.getElementById('crnnProgress');

const uploadArea = document.getElementById('uploadArea');
const fileInput = document.getElementById('fileInput');
const clearBtn = document.getElementById('clearBtn');
const imageCanvas = document.getElementById('imageCanvas');
const canvasPlaceholder = document.getElementById('canvasPlaceholder');
const canvasWrapper = document.getElementById('canvasWrapper');

const taskText = document.getElementById('taskText');
const taskCoco = document.getElementById('taskCoco');
const modeGroup = document.getElementById('modeGroup');

const modeFull = document.getElementById('modeFull');
const modeCrop = document.getElementById('modeCrop');
const thresholdGroup = document.getElementById('thresholdGroup');
const confSlider = document.getElementById('confSlider');
const confVal = document.getElementById('confVal');

const statsArea = document.getElementById('statsArea');
const latencyVal = document.getElementById('latencyVal');
const countVal = document.getElementById('countVal');
const resultsTable = document.getElementById('resultsTable');
const resultsBody = document.getElementById('resultsBody');

// App State
let yoloSession = null;
let cocoSession = null;
let crnnSession = null;
let loadedImage = null;
let currentTask = 'text'; // 'text' or 'coco'
let currentMode = 'full'; // 'full' or 'crop'

// Character mapping for CRNN
const CHARS = "0123456789abcdefghijklmnopqrstuvwxyz";
const idx2char = {};
for (let i = 0; i < CHARS.length; i++) {
    idx2char[i + 1] = CHARS[i];
}

// 80 COCO classes
const COCO_CLASSES = [
    "person", "bicycle", "car", "motorcycle", "airplane", "bus", "train", "truck", "boat", "traffic light",
    "fire hydrant", "stop sign", "parking meter", "bench", "bird", "cat", "dog", "horse", "sheep", "cow",
    "elephant", "bear", "zebra", "giraffe", "backpack", "umbrella", "handbag", "tie", "suitcase", "frisbee",
    "skis", "snowboard", "sports ball", "kite", "baseball bat", "baseball glove", "skateboard", "surfboard", "tennis racket", "bottle",
    "wine glass", "cup", "fork", "knife", "spoon", "bowl", "banana", "apple", "sandwich", "orange",
    "broccoli", "carrot", "hot dog", "pizza", "donut", "cake", "chair", "couch", "potted plant", "bed",
    "dining table", "toilet", "tv", "laptop", "mouse", "remote", "keyboard", "cell phone", "microwave", "oven",
    "toaster", "sink", "refrigerator", "book", "clock", "vase", "scissors", "teddy bear", "hair drier", "toothbrush"
];

// Slider update
confSlider.addEventListener('input', (e) => {
    confVal.textContent = parseFloat(e.target.value).toFixed(2);
    if (loadedImage) {
        runInference();
    }
});

// Mode tab handlers
modeFull.addEventListener('click', () => {
    if (currentMode === 'full') return;
    currentMode = 'full';
    modeFull.classList.add('active');
    modeCrop.classList.remove('active');
    thresholdGroup.style.display = 'flex';
    if (loadedImage) runInference();
});

modeCrop.addEventListener('click', () => {
    if (currentMode === 'crop') return;
    currentMode = 'crop';
    modeCrop.classList.add('active');
    modeFull.classList.remove('active');
    thresholdGroup.style.display = 'none';
    if (loadedImage) runInference();
});

// Task tab handlers
taskText.addEventListener('click', () => {
    if (currentTask === 'text') return;
    currentTask = 'text';
    taskText.classList.add('active');
    taskCoco.classList.remove('active');
    
    // Show OCR-related controls
    modeGroup.style.display = 'flex';
    if (currentMode === 'full') {
        thresholdGroup.style.display = 'flex';
    } else {
        thresholdGroup.style.display = 'none';
    }
    
    // Update results table header
    resultsTable.querySelector('thead tr').innerHTML = `
        <th style="width: 80px;">Index</th>
        <th style="width: 150px;">Confidence</th>
        <th style="width: 200px;">Bounding Box</th>
        <th>Recognized Text</th>
    `;
    
    if (loadedImage) runInference();
});

taskCoco.addEventListener('click', () => {
    if (currentTask === 'coco') return;
    currentTask = 'coco';
    taskCoco.classList.add('active');
    taskText.classList.remove('active');
    
    // Hide OCR-only controls
    modeGroup.style.display = 'none';
    thresholdGroup.style.display = 'flex'; // always show threshold for object detection
    
    // Update results table header for Object Detection
    resultsTable.querySelector('thead tr').innerHTML = `
        <th style="width: 80px;">Index</th>
        <th style="width: 150px;">Confidence</th>
        <th style="width: 200px;">Bounding Box</th>
        <th>Object Category</th>
    `;
    
    if (loadedImage) runInference();
});

// Clear Button handler
clearBtn.addEventListener('click', () => {
    loadedImage = null;
    imageCanvas.style.display = 'none';
    canvasPlaceholder.style.display = 'flex';
    clearBtn.disabled = true;
    fileInput.value = '';
    statsArea.style.display = 'none';
    resultsBody.innerHTML = `
        <tr class="empty-row">
            <td colspan="4">No predictions available. Please upload an image.</td>
        </tr>
    `;
});

// File uploader drag & drop
uploadArea.addEventListener('click', () => fileInput.click());

uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (!uploadArea.classList.contains('disabled')) {
        uploadArea.classList.add('drag-over');
    }
});

uploadArea.addEventListener('dragleave', () => {
    uploadArea.classList.remove('drag-over');
});

uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('drag-over');
    if (uploadArea.classList.contains('disabled')) return;
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        handleFile(e.dataTransfer.files[0]);
    }
});

fileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files.length > 0) {
        handleFile(e.target.files[0]);
    }
});

function handleFile(file) {
    if (!file.type.match('image.*')) {
        alert('Please upload an image file (PNG, JPG, JPEG).');
        return;
    }
    
    const reader = new FileReader();
    reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
            loadedImage = img;
            canvasPlaceholder.style.display = 'none';
            imageCanvas.style.display = 'block';
            clearBtn.disabled = false;
            
            // Draw image on canvas to show loading
            const ctx = imageCanvas.getContext('2d');
            imageCanvas.width = img.width;
            imageCanvas.height = img.height;
            ctx.drawImage(img, 0, 0);
            
            runInference();
        };
        img.src = event.target.result;
    };
    reader.readAsDataURL(file);
}

// Download Helper with Progress Bar
async function fetchWithProgress(url, progressCallback) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    
    const contentLength = response.headers.get('content-length');
    // Hardcoded fallback sizes in case headers are stripped by CDN/Proxies
    const fallbackSizes = {
        'yolo_text.onnx': 12701822,
        'crnn_best.onnx': 35027438
    };
    
    const fileName = url.split('/').pop();
    const total = contentLength ? parseInt(contentLength, 10) : (fallbackSizes[fileName] || 0);
    
    const reader = response.body.getReader();
    const chunks = [];
    let loaded = 0;
    
    while(true) {
        const {done, value} = await reader.read();
        if (done) break;
        chunks.push(value);
        loaded += value.length;
        
        const loadedMB = (loaded / (1024 * 1024)).toFixed(1);
        if (total > 0) {
            const totalMB = (total / (1024 * 1024)).toFixed(1);
            const percent = Math.round((loaded / total) * 100);
            progressCallback(percent, `${loadedMB} MB / ${totalMB} MB`);
        } else {
            progressCallback(0, `${loadedMB} MB loaded`);
        }
    }
    
    const allChunks = new Uint8Array(loaded);
    let position = 0;
    for (const chunk of chunks) {
        allChunks.set(chunk, position);
        position += chunk.length;
    }
    return allChunks;
}

// Initialise models
async function initModels() {
    try {
        console.log("Loading models...");
        
        // 1. Load YOLOv8 Text
        const yoloBytes = await fetchWithProgress('weights/yolo_text.onnx', (percent, statusMsg) => {
            yoloProgress.style.width = `${percent}%`;
            yoloBadge.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> ${statusMsg}`;
        });
        yoloBadge.innerHTML = `<i class="fa-solid fa-bolt"></i> Compiling...`;
        yoloSession = await ort.InferenceSession.create(yoloBytes);
        yoloBadge.className = "model-badge loaded";
        yoloBadge.innerHTML = `<i class="fa-solid fa-check"></i> Ready`;
        
        // 2. Load YOLOv8 COCO
        const cocoBytes = await fetchWithProgress('weights/yolov8n.onnx', (percent, statusMsg) => {
            cocoProgress.style.width = `${percent}%`;
            cocoBadge.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> ${statusMsg}`;
        });
        cocoBadge.innerHTML = `<i class="fa-solid fa-bolt"></i> Compiling...`;
        cocoSession = await ort.InferenceSession.create(cocoBytes);
        cocoBadge.className = "model-badge loaded";
        cocoBadge.innerHTML = `<i class="fa-solid fa-check"></i> Ready`;
        
        // 3. Load CRNN
        const crnnBytes = await fetchWithProgress('weights/crnn_best.onnx', (percent, statusMsg) => {
            crnnProgress.style.width = `${percent}%`;
            crnnBadge.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> ${statusMsg}`;
        });
        crnnBadge.innerHTML = `<i class="fa-solid fa-bolt"></i> Compiling...`;
        crnnSession = await ort.InferenceSession.create(crnnBytes);
        crnnBadge.className = "model-badge loaded";
        crnnBadge.innerHTML = `<i class="fa-solid fa-check"></i> Ready`;
        
        // Update general status
        statusIndicator.className = "status-indicator ready";
        statusText.textContent = "System Ready";
        uploadArea.classList.remove('disabled');
        fileInput.disabled = false;
        console.log("All three models loaded successfully.");
    } catch (err) {
        console.error("Failed to load models:", err);
        statusText.textContent = "Initialization Failed";
        statusText.style.color = "var(--error)";
        alert("Failed to load ONNX models. Please ensure weights/yolo_text.onnx, weights/yolov8n.onnx and weights/crnn_best.onnx are correctly deployed on the server.");
    }
}

// IoU & NMS Helpers
function getIoU(boxA, boxB) {
    const xA = Math.max(boxA[0], boxB[0]);
    const yA = Math.max(boxA[1], boxB[1]);
    const xB = Math.min(boxA[2], boxB[2]);
    const yB = Math.min(boxA[3], boxB[3]);
    
    const interArea = Math.max(0, xB - xA) * Math.max(0, yB - yA);
    const boxAArea = (boxA[2] - boxA[0]) * (boxA[3] - boxA[1]);
    const boxBArea = (boxB[2] - boxB[0]) * (boxB[3] - boxB[1]);
    
    if (boxAArea + boxBArea - interArea === 0) return 0;
    return interArea / (boxAArea + boxBArea - interArea);
}

function runNMS(boxes, scores, iouThreshold) {
    const indices = Array.from({length: boxes.length}, (_, i) => i);
    indices.sort((a, b) => scores[b] - scores[a]);
    
    const keep = [];
    const active = new Array(boxes.length).fill(true);
    
    for (let i = 0; i < indices.length; i++) {
        const idx = indices[i];
        if (!active[idx]) continue;
        
        keep.push(idx);
        for (let j = i + 1; j < indices.length; j++) {
            const jIdx = indices[j];
            if (!active[jIdx]) continue;
            
            if (getIoU(boxes[idx], boxes[jIdx]) > iouThreshold) {
                active[jIdx] = false;
            }
        }
    }
    return keep;
}

// CTC decoding helper
function decodeCTC(outputData) {
    // outputData: 26 time_steps * 37 classes
    const seq = [];
    for (let t = 0; t < 26; t++) {
        let maxVal = -Infinity;
        let maxIdx = -1;
        for (let c = 0; c < 37; c++) {
            const val = outputData[t * 37 + c];
            if (val > maxVal) {
                maxVal = val;
                maxIdx = c;
            }
        }
        seq.push(maxIdx);
    }
    
    const out = [];
    let prev = -1;
    for (const p of seq) {
        if (p !== prev && p !== 0) {
            out.push(CHARS[p - 1]);
        }
        prev = p;
    }
    return out.join("");
}

// Dynamic color generation helper
function getClassColor(classId) {
    if (classId === undefined) return '#10B981';
    // Generate a vibrant HSL color based on class ID
    const hue = (classId * 137.5) % 360; // golden ratio spacing
    return `hsl(${hue}, 85%, 55%)`;
}

// Inference Runner
async function runInference() {
    if (!loadedImage || !yoloSession || !cocoSession || !crnnSession) return;
    
    const startTime = performance.now();
    statusIndicator.className = "status-indicator ready";
    statusText.textContent = "Processing...";
    
    try {
        const results = [];
        
        // Common Preprocessing: Resize and Letterbox input to 640x640
        const yoloCanvas = document.createElement('canvas');
        yoloCanvas.width = 640;
        yoloCanvas.height = 640;
        const yoloCtx = yoloCanvas.getContext('2d');
        
        // Fill with YOLOv8 default gray pad (114, 114, 114)
        yoloCtx.fillStyle = 'rgb(114, 114, 114)';
        yoloCtx.fillRect(0, 0, 640, 640);
        
        const scale = Math.min(640 / loadedImage.width, 640 / loadedImage.height);
        const newW = loadedImage.width * scale;
        const newH = loadedImage.height * scale;
        const padX = (640 - newW) / 2;
        const padY = (640 - newH) / 2;
        yoloCtx.drawImage(loadedImage, padX, padY, newW, newH);
        
        // Extract tensor BCHW
        const imgData = yoloCtx.getImageData(0, 0, 640, 640);
        const pixels = imgData.data;
        const r = new Float32Array(640 * 640);
        const g = new Float32Array(640 * 640);
        const b = new Float32Array(640 * 640);
        
        for (let i = 0; i < 640 * 640; i++) {
            r[i] = pixels[i * 4] / 255.0;
            g[i] = pixels[i * 4 + 1] / 255.0;
            b[i] = pixels[i * 4 + 2] / 255.0;
        }
        
        const tensorData = new Float32Array(3 * 640 * 640);
        tensorData.set(r, 0);
        tensorData.set(g, 640 * 640);
        tensorData.set(b, 2 * 640 * 640);
        
        const yoloInputTensor = new ort.Tensor('float32', tensorData, [1, 3, 640, 640]);
        const threshold = parseFloat(confSlider.value);

        if (currentTask === 'text') {
            if (currentMode === 'full') {
                // --- TASK 1: DETECT (YOLOv8 Text) ---
                // Run YOLOv8
                const yoloOutputs = await yoloSession.run({ images: yoloInputTensor });
                const yoloOutputTensor = yoloOutputs[Object.keys(yoloOutputs)[0]];
                const outData = yoloOutputTensor.data; // shape (1, 5, 8400)
                
                // Parse candidates
                const candidates = [];
                const scores = [];
                
                for (let a = 0; a < 8400; a++) {
                    const score = outData[4 * 8400 + a];
                    if (score >= threshold) {
                        const cx = outData[0 * 8400 + a];
                        const cy = outData[1 * 8400 + a];
                        const w = outData[2 * 8400 + a];
                        const h = outData[3 * 8400 + a];
                        
                        const x1 = cx - w / 2;
                        const y1 = cy - h / 2;
                        const x2 = cx + w / 2;
                        const y2 = cy + h / 2;
                        
                        candidates.push([x1, y1, x2, y2]);
                        scores.push(score);
                    }
                }
                
                // Run NMS
                const keepIndices = runNMS(candidates, scores, 0.45);
                
                // For each crop, run CRNN
                const cropCanvas = document.createElement('canvas');
                cropCanvas.width = 100;
                cropCanvas.height = 32;
                const cropCtx = cropCanvas.getContext('2d');
                
                for (let idx = 0; idx < keepIndices.length; idx++) {
                    const kid = keepIndices[idx];
                    const box = candidates[kid];
                    const score = scores[kid];
                    
                    // Map coordinates back to original image
                    let x1 = (box[0] - padX) / scale;
                    let y1 = (box[1] - padY) / scale;
                    let x2 = (box[2] - padX) / scale;
                    let y2 = (box[3] - padY) / scale;
                    
                    // Clip
                    x1 = Math.max(0, Math.min(loadedImage.width, x1));
                    y1 = Math.max(0, Math.min(loadedImage.height, y1));
                    x2 = Math.max(0, Math.min(loadedImage.width, x2));
                    y2 = Math.max(0, Math.min(loadedImage.height, y2));
                    
                    const w = x2 - x1;
                    const h = y2 - y1;
                    
                    if (w <= 2 || h <= 2) continue;
                    
                    // Run CRNN
                    const text = await runCRNNOnCrop(x1, y1, w, h, cropCanvas, cropCtx);
                    results.push({
                        text: text,
                        score: score,
                        box: [Math.round(x1), Math.round(y1), Math.round(x2), Math.round(y2)]
                    });
                }
            } else {
                // --- TASK 2: RECOGNIZE ONLY (CRNN) ---
                const cropCanvas = document.createElement('canvas');
                cropCanvas.width = 100;
                cropCanvas.height = 32;
                const cropCtx = cropCanvas.getContext('2d');
                
                const text = await runCRNNOnCrop(0, 0, loadedImage.width, loadedImage.height, cropCanvas, cropCtx);
                results.push({
                    text: text,
                    score: 1.0,
                    box: [0, 0, loadedImage.width, loadedImage.height]
                });
            }
        } else {
            // --- TASK 3: DETECT OBJECTS (YOLOv8 COCO) ---
            const cocoOutputs = await cocoSession.run({ images: yoloInputTensor });
            const cocoOutputTensor = cocoOutputs[Object.keys(cocoOutputs)[0]];
            const outData = cocoOutputTensor.data; // shape (1, 84, 8400)
            
            const candidates = [];
            const scores = [];
            const classes = [];
            
            for (let a = 0; a < 8400; a++) {
                let maxClassScore = -Infinity;
                let bestClassId = -1;
                for (let c = 0; c < 80; c++) {
                    const score = outData[(4 + c) * 8400 + a];
                    if (score > maxClassScore) {
                        maxClassScore = score;
                        bestClassId = c;
                    }
                }
                
                if (maxClassScore >= threshold) {
                    const cx = outData[0 * 8400 + a];
                    const cy = outData[1 * 8400 + a];
                    const w = outData[2 * 8400 + a];
                    const h = outData[3 * 8400 + a];
                    
                    const x1 = cx - w / 2;
                    const y1 = cy - h / 2;
                    const x2 = cx + w / 2;
                    const y2 = cy + h / 2;
                    
                    candidates.push([x1, y1, x2, y2]);
                    scores.push(maxClassScore);
                    classes.push(bestClassId);
                }
            }
            
            // Run NMS
            const keepIndices = runNMS(candidates, scores, 0.45);
            
            for (let idx = 0; idx < keepIndices.length; idx++) {
                const kid = keepIndices[idx];
                const box = candidates[kid];
                const score = scores[kid];
                const classId = classes[kid];
                
                let x1 = (box[0] - padX) / scale;
                let y1 = (box[1] - padY) / scale;
                let x2 = (box[2] - padX) / scale;
                let y2 = (box[3] - padY) / scale;
                
                x1 = Math.max(0, Math.min(loadedImage.width, x1));
                y1 = Math.max(0, Math.min(loadedImage.height, y1));
                x2 = Math.max(0, Math.min(loadedImage.width, x2));
                y2 = Math.max(0, Math.min(loadedImage.height, y2));
                
                results.push({
                    text: COCO_CLASSES[classId],
                    score: score,
                    box: [Math.round(x1), Math.round(y1), Math.round(x2), Math.round(y2)],
                    classId: classId
                });
            }
        }
        
        // Render Canvas
        renderCanvas(results);
        
        // Render results table & stats
        renderResultsTable(results, startTime);
        
    } catch (err) {
        console.error("Inference failed:", err);
        statusText.textContent = "Inference Error";
        statusIndicator.className = "status-indicator loading"; // turns warning/amber
    }
}
        
        // Render Canvas
        renderCanvas(results);
        
        // Render results table & stats
        renderResultsTable(results, startTime);
        
    } catch (err) {
        console.error("Inference failed:", err);
        statusText.textContent = "Inference Error";
        statusIndicator.className = "status-indicator loading"; // turns warning/amber
    }
}

// Recognizer Engine Helper
async function runCRNNOnCrop(x, y, w, h, cropCanvas, cropCtx) {
    // Clear and draw crop
    cropCtx.clearRect(0, 0, 100, 32);
    cropCtx.drawImage(loadedImage, x, y, w, h, 0, 0, 100, 32);
    
    // RGB to Grayscale & Normalisation
    const imgData = cropCtx.getImageData(0, 0, 100, 32);
    const pixels = imgData.data;
    const grayData = new Float32Array(100 * 32);
    
    for (let i = 0; i < 100 * 32; i++) {
        const r = pixels[i * 4];
        const g = pixels[i * 4 + 1];
        const b = pixels[i * 4 + 2];
        const gray = 0.299 * r + 0.587 * g + 0.114 * b;
        grayData[i] = (gray / 255.0 - 0.5) / 0.5; // [-1.0, 1.0]
    }
    
    const crnnInputTensor = new ort.Tensor('float32', grayData, [1, 1, 32, 100]);
    const crnnOutputs = await crnnSession.run({ input: crnnInputTensor });
    const crnnOutputTensor = crnnOutputs[Object.keys(crnnOutputs)[0]];
    return decodeCTC(crnnOutputTensor.data);
}

// Canvas Drawer
function renderCanvas(results) {
    const ctx = imageCanvas.getContext('2d');
    imageCanvas.width = loadedImage.width;
    imageCanvas.height = loadedImage.height;
    ctx.drawImage(loadedImage, 0, 0);
    
    if (currentTask === 'text' && currentMode === 'crop') return; // Don't draw boxes on full image in Crop-only mode
    
    results.forEach((res, index) => {
        const [x1, y1, x2, y2] = res.box;
        const w = x2 - x1;
        const h = y2 - y1;
        
        const color = getClassColor(res.classId);
        
        // 1. Draw glowing neon bounding box
        ctx.strokeStyle = color;
        ctx.lineWidth = Math.max(2, Math.round(loadedImage.width / 300));
        ctx.shadowColor = color.replace('hsl', 'hsla').replace(')', ', 0.6)');
        ctx.shadowBlur = 8;
        ctx.strokeRect(x1, y1, w, h);
        
        // Reset shadows
        ctx.shadowBlur = 0;
        
        // 2. Draw Text Badge above the box
        const fontSize = Math.max(12, Math.round(loadedImage.width / 40));
        ctx.font = `bold ${fontSize}px var(--font-sans)`;
        const textStr = `${index + 1}. ${res.text.toUpperCase()}`;
        const textWidth = ctx.measureText(textStr).width;
        
        // Draw background for badge
        ctx.fillStyle = 'rgba(11, 15, 25, 0.85)';
        const badgeHeight = fontSize + 6;
        const badgeY = y1 - badgeHeight >= 0 ? y1 - badgeHeight : y1 + h;
        
        ctx.fillRect(x1 - 1, badgeY, textWidth + 12, badgeHeight);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.strokeRect(x1 - 1, badgeY, textWidth + 12, badgeHeight);
        
        // Draw Text inside badge
        ctx.fillStyle = '#ffffff';
        ctx.fillText(textStr, x1 + 6, badgeY + fontSize);
    });
}

// Results Table Renderer
function renderResultsTable(results, startTime) {
    const latency = Math.round(performance.now() - startTime);
    latencyVal.textContent = `${latency}ms`;
    countVal.textContent = results.length;
    statsArea.style.display = 'flex';
    
    if (results.length === 0) {
        const typeStr = currentTask === 'text' ? 'text' : 'objects';
        resultsBody.innerHTML = `
            <tr class="empty-row">
                <td colspan="4">No ${typeStr} detected. Try lowering the confidence threshold.</td>
            </tr>
        `;
        statusText.textContent = `No ${typeStr.charAt(0).toUpperCase() + typeStr.slice(1)} Detected`;
        return;
    }
    
    statusText.textContent = `Completed in ${latency}ms`;
    
    let html = '';
    results.forEach((res, index) => {
        const confPct = Math.round(res.score * 100);
        let confClass = 'conf-high';
        if (confPct < 40) confClass = 'conf-low';
        else if (confPct < 70) confClass = 'conf-med';
        
        const boxStr = `[${res.box.join(', ')}]`;
        
        // Vibrant category coloring in table
        const color = getClassColor(res.classId);
        const translucentBg = color.replace('hsl', 'hsla').replace(')', ', 0.12)');
        const borderCol = color.replace('hsl', 'hsla').replace(')', ', 0.35)');
        
        html += `
            <tr>
                <td class="idx-col">${index + 1}</td>
                <td class="conf-col ${confClass}">${confPct}%</td>
                <td class="box-col">${boxStr}</td>
                <td><span class="text-col" style="background: ${translucentBg}; border-color: ${borderCol}; color: ${color};">${res.text.toUpperCase() || '<em>[BLANK]</em>'}</span></td>
            </tr>
        `;
    });
    
    resultsBody.innerHTML = html;
}

// Run initial model loader
document.addEventListener('DOMContentLoaded', initModels);
