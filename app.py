# -*- coding: utf-8 -*-
# Streamlit UI for the Scene Text Reader (ICDAR 2003)
# Run:  streamlit run app.py
# Needs two weight files in the same folder: yolo_text.pt (YOLOv8) and crnn_best.pth (CRNN)
import streamlit as st
import numpy as np, cv2, torch, torch.nn as nn
from PIL import Image
from ultralytics import YOLO

st.set_page_config(page_title="Scene Text Reader - ICDAR2003", layout="wide")
IMG_H, IMG_W = 32, 100
CHARS = "0123456789abcdefghijklmnopqrstuvwxyz"
idx2char = {i + 1: c for i, c in enumerate(CHARS)}
NUM_CLASSES = len(CHARS) + 1
DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")

class CRNN(nn.Module):
    def __init__(self, num_classes, hidden=256):
        super().__init__()
        def cb(i, o, k=3, s=1, p=1, bn=False):
            L = [nn.Conv2d(i, o, k, s, p)]
            if bn: L.append(nn.BatchNorm2d(o))
            L.append(nn.ReLU(inplace=True)); return L
        self.cnn = nn.Sequential(
            *cb(1,64), nn.MaxPool2d(2,2), *cb(64,128), nn.MaxPool2d(2,2),
            *cb(128,256,bn=True), *cb(256,256), nn.MaxPool2d((2,2),(2,1),(0,1)),
            *cb(256,512,bn=True), *cb(512,512), nn.MaxPool2d((2,2),(2,1),(0,1)),
            *cb(512,512,k=2,s=1,p=0,bn=True))
        self.rnn = nn.LSTM(512, hidden, 2, bidirectional=True)
        self.fc = nn.Linear(hidden*2, num_classes)
    def forward(self, x):
        f = self.cnn(x).squeeze(2).permute(2,0,1)
        o,_ = self.rnn(f)
        return self.fc(o).log_softmax(2)

def decode(logp):
    seq = logp.argmax(2).squeeze(1).cpu().numpy()
    prev=-1; out=[]
    for p in seq:
        if p!=prev and p!=0: out.append(idx2char[p])
        prev=p
    return "".join(out)

@st.cache_resource
def load_models():
    det = YOLO("yolo_text.pt")
    rec = CRNN(NUM_CLASSES).to(DEVICE)
    rec.load_state_dict(torch.load("crnn_best.pth", map_location=DEVICE, weights_only=True))
    rec.eval()
    return det, rec

def recognize(bgr, rec):
    g = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    g = cv2.resize(g,(IMG_W,IMG_H)).astype(np.float32)/255.0
    x = torch.from_numpy((g-0.5)/0.5).unsqueeze(0).unsqueeze(0).to(DEVICE)
    with torch.no_grad():
        return decode(rec(x))

det, rec = load_models()
st.title("Scene Text Reader - Object Detection & Recognition (ICDAR 2003)")
st.caption("YOLOv8 detects text regions + CRNN/CTC recognises the content")

mode = st.sidebar.radio("Mode", ["Full image (Detect + Recognize)", "Cropped word (Recognize only)"])
conf = st.sidebar.slider("Detection confidence threshold", 0.05, 0.9, 0.25, 0.05)
up = st.file_uploader("Upload an image", type=["jpg","jpeg","png"])

if up:
    img = cv2.cvtColor(np.array(Image.open(up).convert("RGB")), cv2.COLOR_RGB2BGR)
    if mode.startswith("Full"):
        res = det.predict(img, conf=conf, verbose=False)[0]
        vis = img.copy(); rows=[]
        for b in res.boxes:
            x1,y1,x2,y2 = map(int, b.xyxy[0].tolist())
            crop = img[max(0,y1):y2, max(0,x1):x2]
            if crop.size==0: continue
            t = recognize(crop, rec)
            rows.append({"text": t, "conf": round(float(b.conf[0]),3)})
            cv2.rectangle(vis,(x1,y1),(x2,y2),(0,0,255),2)
            cv2.putText(vis,t,(x1,max(0,y1-6)),cv2.FONT_HERSHEY_SIMPLEX,0.7,(0,255,0),2)
        c1,c2 = st.columns([2,1])
        c1.image(cv2.cvtColor(vis,cv2.COLOR_BGR2RGB), use_container_width=True)
        c2.subheader("Results"); c2.write(f"Detected **{len(rows)}** text boxes")
        if rows: c2.table(rows)
    else:
        st.image(cv2.cvtColor(img,cv2.COLOR_BGR2RGB), width=300)
        st.success("Read: **%s**" % recognize(img, rec))
