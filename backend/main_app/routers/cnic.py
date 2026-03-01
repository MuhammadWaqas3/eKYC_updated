"""
CNIC OCR Router - Merged into main_app
"""

import re, base64, os
from datetime import datetime, date
from typing import Optional, Dict, Any, List, Tuple
from difflib import SequenceMatcher

from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import JSONResponse
import numpy as np
import cv2

try:
    import easyocr
    EASYOCR_AVAILABLE = True
except ImportError:
    EASYOCR_AVAILABLE = False
    print("WARNING: EasyOCR not available")

try:
    from ultralytics import YOLO
    YOLO_AVAILABLE = True
except ImportError:
    YOLO_AVAILABLE = False
    print("WARNING: YOLO not available")

try:
    from pyzbar.pyzbar import decode as decode_barcode
    BARCODE_AVAILABLE = True
except ImportError:
    BARCODE_AVAILABLE = False
    print("WARNING: pyzbar not available")

# ═══════════════════════════════════════════
#  YE LINE IMPORTANT HAI — app nahi, router hai
# ═══════════════════════════════════════════
router = APIRouter(prefix="/cnic", tags=["CNIC OCR"])

# ═══════════════════════════════════════════
#  CONFIG — YOLO path relative rakha hai
# ═══════════════════════════════════════════
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CUSTOM_YOLO_MODEL_PATH = os.path.join(
    BASE_DIR, "dataset", "runs", "detect", "train2", "weights", "best.pt"
)
YOLO_CLASSES      = {0: 'Back', 1: 'Front'}
CNIC_WIDTH        = 856
CNIC_HEIGHT       = 540
OCR_CONF_FRONT    = 0.30
OCR_CONF_BACK     = 0.20
MIN_OCR_LINES     = 2
YOLO_CONF         = 0.40
YOLO_MIN_COVERAGE = 0.35

reader     = None
yolo_model = None

# ═══════════════════════════════════════════
#  SANITIZE
# ═══════════════════════════════════════════
def sanitize(obj):
    if isinstance(obj, dict):        return {k: sanitize(v) for k, v in obj.items()}
    if isinstance(obj, list):        return [sanitize(i) for i in obj]
    if isinstance(obj, np.bool_):    return bool(obj)
    if isinstance(obj, np.integer):  return int(obj)
    if isinstance(obj, np.floating): return float(obj)
    if isinstance(obj, np.ndarray):  return obj.tolist()
    return obj

# ═══════════════════════════════════════════
#  HELPERS
# ═══════════════════════════════════════════
def fuzzy_match(text, keyword, threshold=0.80):
    text = text.lower().strip(); keyword = keyword.lower().strip()
    if keyword in text: return True
    klen = len(keyword)
    for i in range(max(0, len(text)-klen+1)):
        if SequenceMatcher(None, text[i:i+klen], keyword).ratio() >= threshold:
            return True
    return False

def fuzzy_any(text, keywords, threshold=0.82):
    return any(fuzzy_match(text, kw, threshold) for kw in keywords)

def has_urdu(text):
    return bool(re.search(r'[\u0600-\u06FF]', text))

def is_date(text):
    return bool(re.search(r'\d{1,2}[.\-/]\d{1,2}[.\-/]\d{4}', text))

def is_cnic_like(text):
    cleaned = re.sub(r'[\s.\-–]', '', text)
    return bool(re.search(r'\d{13}', cleaned)) or \
           bool(re.search(r'\d{5}[-\s]?\d{7}[-\s]?\d', text))

def clean_val(text, keywords):
    r = text
    for kw in keywords:
        r = re.sub(re.escape(kw), '', r, flags=re.IGNORECASE)
    r = re.sub(r'[:\-–|،]', ' ', r)
    return re.sub(r'\s+', ' ', r).strip()

# ═══════════════════════════════════════════
#  MODEL INIT — main.py startup se call hoga
# ═══════════════════════════════════════════
def initialize_models():
    global reader, yolo_model
    if EASYOCR_AVAILABLE and reader is None:
        print("Initializing EasyOCR...")
        try:
            reader = easyocr.Reader(['en', 'ur'], gpu=False, verbose=False)
            print("✓ EasyOCR ready!")
        except Exception as e:
            print(f"✗ EasyOCR failed: {e}")
    if YOLO_AVAILABLE and yolo_model is None:
        print(f"Loading YOLO: {CUSTOM_YOLO_MODEL_PATH}")
        try:
            if os.path.exists(CUSTOM_YOLO_MODEL_PATH):
                yolo_model = YOLO(CUSTOM_YOLO_MODEL_PATH)
                print("✓ Custom YOLO loaded!")
            else:
                yolo_model = YOLO('yolov8n.pt')
                print("⚠ Using fallback yolov8n")
        except Exception as e:
            print(f"✗ YOLO failed: {e}")

# ═══════════════════════════════════════════
#  IMAGE PROCESSING
# ═══════════════════════════════════════════
def preprocess_for_ocr(image):
    if image is None or image.size == 0: return image
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if len(image.shape)==3 else image.copy()
    h, w = gray.shape
    if w < 800:
        scale = 800/w
        gray = cv2.resize(gray, (int(w*scale), int(h*scale)), interpolation=cv2.INTER_CUBIC)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8,8))
    enhanced = clahe.apply(gray)
    return cv2.fastNlMeansDenoising(enhanced, None, 8, 7, 21)

def detect_card_contour(image):
    h, w = image.shape[:2]
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if len(image.shape)==3 else image
    blurred = cv2.GaussianBlur(gray, (5,5), 0)
    edges   = cv2.Canny(blurred, 50, 150)
    dilated = cv2.dilate(edges, np.ones((3,3), np.uint8), iterations=2)
    contours, _ = cv2.findContours(dilated, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    contours = sorted(contours, key=cv2.contourArea, reverse=True)
    for cnt in contours[:10]:
        if cv2.contourArea(cnt) < 0.10*h*w: continue
        peri   = cv2.arcLength(cnt, True)
        approx = cv2.approxPolyDP(cnt, 0.02*peri, True)
        if len(approx) == 4:
            return approx.reshape(4,2).astype(np.float32)
    return None

def order_points(pts):
    rect = np.zeros((4,2), dtype=np.float32)
    s = pts.sum(axis=1); diff = np.diff(pts, axis=1)
    rect[0]=pts[np.argmin(s)];  rect[2]=pts[np.argmax(s)]
    rect[1]=pts[np.argmin(diff)]; rect[3]=pts[np.argmax(diff)]
    return rect

def perspective_correction(image):
    pts = detect_card_contour(image)
    if pts is None:
        return image, False
    rect = order_points(pts)
    dst  = np.array([[0,0],[CNIC_WIDTH-1,0],[CNIC_WIDTH-1,CNIC_HEIGHT-1],[0,CNIC_HEIGHT-1]], dtype=np.float32)
    M = cv2.getPerspectiveTransform(rect, dst)
    return cv2.warpPerspective(image, M, (CNIC_WIDTH, CNIC_HEIGHT)), True

# ═══════════════════════════════════════════
#  YOLO
# ═══════════════════════════════════════════
def detect_cnic_yolo(image):
    global yolo_model
    if not YOLO_AVAILABLE or yolo_model is None:
        return image, "Unknown", 0.0
    try:
        img_h, img_w = image.shape[:2]
        total_area   = img_h * img_w
        results      = yolo_model(image, verbose=False, conf=YOLO_CONF)
        best = None; best_area = 0

        for result in results:
            if result.boxes is None: continue
            for box in result.boxes:
                x1,y1,x2,y2 = box.xyxy[0].cpu().numpy()
                cls_id = int(box.cls[0].cpu().numpy())
                conf   = float(box.conf[0].cpu().numpy())
                area   = (x2-x1)*(y2-y1)
                if area > best_area:
                    best_area = area
                    best = {'bbox':(int(x1),int(y1),int(x2),int(y2)),
                            'cls':cls_id, 'conf':conf, 'area':area}
        if best:
            x1,y1,x2,y2 = best['bbox']
            side     = YOLO_CLASSES.get(best['cls'], 'Unknown')
            coverage = best['area'] / total_area
            print(f"  YOLO: {side}  conf={best['conf']:.3f}  coverage={coverage:.1%}")
            if coverage >= YOLO_MIN_COVERAGE:
                pad = 20
                cropped = image[max(0,y1-pad):min(img_h,y2+pad),
                                max(0,x1-pad):min(img_w,x2+pad)]
                if cropped.size > 0:
                    return cropped, side, best['conf']
            print(f"  ⚠ coverage {coverage:.1%} < {YOLO_MIN_COVERAGE:.0%} → full image")
            return image, side, best['conf']
    except Exception as e:
        print(f"  YOLO error: {e}")
    return image, "Unknown", 0.0

def auto_detect_side(image):
    global yolo_model
    if not YOLO_AVAILABLE or yolo_model is None: return "Unknown", 0.0
    try:
        results = yolo_model(image, verbose=False, conf=YOLO_CONF)
        for result in results:
            if result.boxes is None or len(result.boxes)==0: continue
            best_conf, best_side = 0.0, "Unknown"
            for box in result.boxes:
                cls_id = int(box.cls[0].cpu().numpy())
                conf   = float(box.conf[0].cpu().numpy())
                if conf > best_conf:
                    best_conf = conf
                    best_side = YOLO_CLASSES.get(cls_id, 'Unknown')
            if best_side != "Unknown": return best_side, best_conf
    except Exception as e:
        print(f"Side detect error: {e}")
    return "Unknown", 0.0

# ═══════════════════════════════════════════
#  VERIFY
# ═══════════════════════════════════════════
def verify_is_cnic(image):
    if image is None or image.size==0: return False, "Invalid image", {}
    h, w  = image.shape[:2]
    ratio = round(w/h, 2)
    ar_ok = 1.1 < ratio < 2.2
    if not ar_ok:
        return False, f"Aspect ratio {ratio} invalid (need 1.1-2.2)", {}
    hsv  = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
    gm1  = cv2.inRange(hsv, np.array([35,40,30]),  np.array([90,255,255]))
    gm2  = cv2.inRange(hsv, np.array([35,20,20]),  np.array([90,150,150]))
    gm3  = cv2.inRange(hsv, np.array([25,30,100]), np.array([85,255,255]))
    gpct = round((cv2.countNonZero(gm1)+cv2.countNonZero(gm2)+cv2.countNonZero(gm3))/(h*w)*100,1)
    gray    = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    edges   = cv2.Canny(gray, 50, 150)
    edgepct = round(cv2.countNonZero(edges)/edges.size*100, 2)
    ia = {"overall_passed":True, "ar_valid":ar_ok, "aspect_ratio":str(ratio),
          "color_valid":gpct>=0.8, "color_pct":str(gpct),
          "perspective_fixed":False, "edge_density":str(edgepct)}
    return True, "", ia

# ═══════════════════════════════════════════
#  OCR
# ═══════════════════════════════════════════
def perform_ocr(image, conf_threshold=None):
    global reader
    if not EASYOCR_AVAILABLE or reader is None: return [], [], False
    if conf_threshold is None: conf_threshold = OCR_CONF_FRONT
    try:
        processed = preprocess_for_ocr(image)
        raw = reader.readtext(processed)
        raw.sort(key=lambda x: x[0][0][1])
        lines, details = [], []
        for bbox, text, conf in raw:
            if conf >= conf_threshold and text.strip():
                lines.append(text.strip())
                details.append({"text":text.strip(), "conf":round(conf,3), "bbox":bbox})
        return lines, details, len(lines) >= MIN_OCR_LINES
    except Exception as e:
        print(f"  OCR error: {e}")
        return [], [], False

# ═══════════════════════════════════════════
#  PARSE
# ═══════════════════════════════════════════
NOISE_EN = ['republic','pakistan','islamic','identity','card','national','nadra',
            'cnic','address','gender','date','issue','expiry','birth',
            'present','permanent','district','tehsil','city','province',
            'validity','signature','thumb','registrar','general','country',
            'federal','islamabad','holder']

def looks_like_name(text):
    text = text.strip()
    if len(text) < 2: return False
    if is_date(text) or is_cnic_like(text): return False
    if re.search(r'\d{3,}', text): return False
    if fuzzy_any(text, NOISE_EN, 0.82): return False
    return bool(re.search(r'[A-Za-z\u0600-\u06FF]', text))

def clean_name(text):
    cleaned = re.sub(r'^[Il|10O\s]+', '', text.strip())
    return cleaned.strip()

def parse_cnic_number(lines):
    for text in lines:
        t = re.sub(r'[\"\'`\u2018\u2019]', '', text)
        t = re.sub(r'(\d{5})[.\s]+(\d{7})[.\s]+(\d)', r'\1-\2-\3', t)
        t = re.sub(r'(\d{5})-(\d{7})[.\s]+(\d)', r'\1-\2-\3', t)
        m = re.search(r'\d{5}[-\s]\d{7}[-\s]\d', t)
        if m:
            return re.sub(r'[\s]', '-', m.group())
        digits = re.sub(r'[\s.\-–]', '', t)
        m2 = re.search(r'\d{13}', digits)
        if m2:
            d = m2.group()
            return f"{d[:5]}-{d[5:12]}-{d[12]}"
    return None

def parse_name_and_father(lines):
    name = father = None
    for i, line in enumerate(lines):
        ll = line.lower()
        if father is None and fuzzy_any(ll, ['father','والد'], 0.85):
            val = line.split(':',1)[-1].strip() if ':' in line else line
            c   = clean_name(clean_val(val, ['Father Name','Father','والد کا نام','والد']))
            if looks_like_name(c): father = c
            elif i+1 < len(lines) and looks_like_name(lines[i+1]):
                father = clean_name(lines[i+1])
        elif name is None and (fuzzy_any(ll, ['name','نام'], 0.85) or re.search(r'\bname\b', ll)):
            val = line.split(':',1)[-1].strip() if ':' in line else line
            c   = clean_name(clean_val(val, ['Name','نام']))
            if looks_like_name(c): name = c
            elif i+1 < len(lines) and looks_like_name(lines[i+1]):
                name = clean_name(lines[i+1])
    if not name or not father:
        found, cands = False, []
        for line in lines:
            ll = line.lower()
            if not found:
                if fuzzy_any(ll, ['pakistan','republic','identity','national'], 0.82):
                    found = True
                continue
            c = clean_name(line)
            if looks_like_name(c): cands.append(c)
            if len(cands) >= 3: break
        if not name    and cands:          name   = cands[0]
        if not father  and len(cands) >= 2: father = cands[1]
    return name, father

def parse_gender(lines):
    for text in lines:
        tl = text.strip(); tll = tl.lower()
        if re.search(r'\bfemale\b|عورت', tll): return "Female"
        if re.search(r'\bmale\b|مرد',   tll): return "Male"
        if tl in ('M', 'Male'):               return "Male"
        if tl in ('F', 'Female'):             return "Female"
        if 'gender' in tll:
            if re.search(r'\bf\b', tll): return "Female"
            if re.search(r'\bm\b', tll): return "Male"
    return None

def extract_date(text):
    t = re.sub(r'(\d)\s+(\d)', r'\1\2', text)
    m = re.search(r'(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})', t)
    if m:
        d, mo, y = m.groups()
        if 1<=int(d)<=31 and 1<=int(mo)<=12 and 1900<=int(y)<=2100:
            return f"{d.zfill(2)}.{mo.zfill(2)}.{y}"
    m2 = re.search(r'(\d{2})(\d{2})(\d{4})', t)
    if m2:
        d, mo, y = m2.groups()
        if 1<=int(d)<=31 and 1<=int(mo)<=12 and 1900<=int(y)<=2100:
            return f"{d}.{mo}.{y}"
    return None

def parse_dates(lines):
    res = {'dob':None, 'issue':None, 'expiry':None}
    dob_kw    = ['date of birth','dob','birth','تاریخ پیدائش','پیدائش']
    issue_kw  = ['date of issue','issue date','issue','اجراء','اجرا']
    expiry_kw = ['date of expiry','expiry date','expiry','valid until','valid upto','ختم']
    for i, line in enumerate(lines):
        ll  = line.lower()
        nxt = lines[i+1] if i+1<len(lines) else ''
        if not res['dob']    and fuzzy_any(ll, dob_kw,    0.82): res['dob']    = extract_date(line) or extract_date(nxt)
        if not res['issue']  and fuzzy_any(ll, issue_kw,  0.82): res['issue']  = extract_date(line) or extract_date(nxt)
        if not res['expiry'] and fuzzy_any(ll, expiry_kw, 0.82): res['expiry'] = extract_date(line) or extract_date(nxt)
    if not (res['dob'] and res['issue'] and res['expiry']):
        all_dates = []
        for line in lines:
            dv = extract_date(line)
            if dv and dv not in all_dates: all_dates.append(dv)
        def gy(d):
            try: return int(d.split('.')[-1])
            except: return 0
        sd = sorted(set(all_dates), key=gy)
        if not res['dob']    and len(sd)>=1: res['dob']    = sd[0]
        if not res['issue']  and len(sd)>=2: res['issue']  = sd[1]
        if not res['expiry'] and len(sd)>=2: res['expiry'] = sd[-1]
    def gy(d):
        try: return int(d.split('.')[-1])
        except: return 0
    if res['issue'] and res['expiry'] and gy(res['issue'])>gy(res['expiry']):
        res['issue'], res['expiry'] = res['expiry'], res['issue']
    if res['dob'] and res['issue'] and gy(res['dob'])>gy(res['issue']):
        res['dob'], res['issue'] = res['issue'], res['dob']
    return res

def parse_address(lines):
    addr_kw = ['address','present address','permanent address','پتہ']
    stop_kw = ['name','father','date','gender','cnic','issue','expiry','birth',
               'signature','registrar','validity']
    capturing, parts = False, []
    for line in lines:
        ll = line.lower()
        if fuzzy_any(ll, addr_kw, 0.82):
            capturing = True
            if ':' in line:
                val = clean_val(line.split(':',1)[-1], ['Address','Present Address','Permanent Address'])
                if val and len(val)>2: parts.append(val)
            continue
        if capturing:
            if fuzzy_any(ll, stop_kw, 0.85): break
            if line and not is_cnic_like(line) and not is_date(line): parts.append(line)
            if len(parts)>=3: break
    return ' '.join(parts).strip() or None

def parse_back_urdu_address(lines):
    addr_kw = ['موجودہ','موجودہ پتہ','مستقل','مستقل پتہ','پتہ']
    noise   = ['جمہوریہ','پاکستان','اسلامی','شناختی','رجسٹرار','جنرل','دستخط']
    district, parts = None, []
    for i, line in enumerate(lines):
        line = line.strip()
        if not line or is_cnic_like(line) or is_date(line): continue
        if any(n in line for n in noise): continue
        if any(kw in line for kw in addr_kw):
            content = line
            for kw in addr_kw: content = content.replace(kw,'')
            content = re.sub(r'[:\-–،]', ' ', content).strip()
            if content and len(content)>1: parts.append(content)
            for j in range(i+1, min(i+4,len(lines))):
                nl = lines[j].strip()
                if not nl or is_cnic_like(nl) or is_date(nl): break
                if any(n in nl for n in noise): break
                if has_urdu(nl):
                    if 'ضلع' in nl: district = nl.replace('ضلع','').strip()
                    parts.append(nl)
            break
        if has_urdu(line) and 'ضلع' in line:
            district = line.replace('ضلع','').strip()
            parts.append(line)
    return district, (' '.join(parts).strip() or None)

def extract_photo(image):
    try:
        h, w = image.shape[:2]
        region = image[int(h*0.05):int(h*0.65), int(w*0.65):int(w*0.95)]
        if region.size > 0:
            _, buf = cv2.imencode('.png', region)
            return base64.b64encode(buf).decode('utf-8')
    except Exception as e:
        print(f"Photo error: {e}")
    return None

def extract_barcode(image):
    if not BARCODE_AVAILABLE: return None, None
    try:
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if len(image.shape)==3 else image
        for img in [gray, cv2.createCLAHE(clipLimit=2.0,tileGridSize=(8,8)).apply(gray)]:
            barcodes = decode_barcode(img)
            if barcodes: return barcodes[0].data.decode('utf-8'), str(barcodes[0].type)
    except Exception as e:
        print(f"Barcode error: {e}")
    return None, None

def build_regions(lines, details):
    cnic_d  = [d for d in details if is_cnic_like(d['text'])]
    date_d  = [d for d in details if is_date(d['text'])]
    urdu_d  = [d for d in details if has_urdu(d['text'])]
    other_d = [d for d in details if not is_cnic_like(d['text'])
               and not is_date(d['text']) and not has_urdu(d['text'])]
    reg = {}
    if cnic_d:  reg['cnic_number'] = {"texts":[d['text'] for d in cnic_d],  "confidence":max(d['conf'] for d in cnic_d)}
    if date_d:  reg['dates']       = {"texts":[d['text'] for d in date_d],  "confidence":sum(d['conf'] for d in date_d)/len(date_d)}
    if urdu_d:  reg['urdu_text']   = {"texts":[d['text'] for d in urdu_d],  "confidence":sum(d['conf'] for d in urdu_d)/len(urdu_d)}
    if other_d:
        top  = other_d[:4]; rest = other_d[4:]
        reg['name_region']  = {"texts":[d['text'] for d in top],  "confidence":sum(d['conf'] for d in top)/max(len(top),1)}
        if rest: reg['other_text'] = {"texts":[d['text'] for d in rest], "confidence":sum(d['conf'] for d in rest)/len(rest)}
    return reg

# ═══════════════════════════════════════════
#  VALIDATION
# ═══════════════════════════════════════════
def validate_age(dob_str):
    if not dob_str: return {"passed":False,"note":"DOB not found","age":None}
    try:
        dob = datetime.strptime(dob_str, "%d.%m.%Y").date()
        age = (date.today()-dob).days//365
        ok  = age>=18
        return {"passed":ok,"age":int(age),"dob":dob_str,
                "note":f"Age {age} — {'Valid (18+)' if ok else 'Under 18 ❌'}"}
    except:
        return {"passed":False,"note":f"Cannot parse DOB: {dob_str}","age":None}

def validate_expiry(expiry_str):
    if not expiry_str: return {"passed":False,"note":"Expiry not found","days_remaining":None}
    try:
        exp  = datetime.strptime(expiry_str, "%d.%m.%Y").date()
        days = (exp-date.today()).days
        ok   = days>=0
        return {"passed":ok,"expiry":expiry_str,"days_remaining":days,
                "note":f"Valid until {expiry_str} ({days} days)" if ok
                       else f"EXPIRED {expiry_str} ({abs(days)} days ago) ❌"}
    except:
        return {"passed":False,"note":f"Cannot parse expiry: {expiry_str}","days_remaining":None}

def validate_cnic_format(cnic_str):
    if not cnic_str: return {"passed":False,"note":"CNIC not found"}
    ok = bool(re.match(r'^\d{5}-\d{7}-\d$', cnic_str.strip()))
    return {"passed":ok,"cnic":cnic_str,
            "note":"Format valid ✓" if ok else f"Invalid format: {cnic_str}"}

def validate_gender_from_cnic(cnic_str):
    if not cnic_str: return {"passed":False,"note":"CNIC not found","gender_from_cnic":None}
    digits = re.sub(r'\D','',cnic_str)
    if len(digits)!=13:
        return {"passed":False,"note":f"CNIC length {len(digits)} ≠ 13","gender_from_cnic":None}
    last   = int(digits[-1])
    gender = "Male" if last%2!=0 else "Female"
    return {"passed":True,"last_digit":last,"gender_from_cnic":gender,
            "note":f"Last digit {last} → {gender}"}

def determine_status(age_ok, expiry_ok, fmt_ok, has_data):
    if not has_data:  return "incomplete"
    if not age_ok:    return "rejected_underage"
    if not expiry_ok: return "rejected_expired"
    if not fmt_ok:    return "invalid_cnic"
    return "valid"

def compute_confidence(lines, cnic, name, dob, expiry):
    s = 0
    if cnic:          s += 35
    if name:          s += 20
    if dob:           s += 15
    if expiry:        s += 15
    if len(lines)>=5: s += 15
    return min(s, 100)

# ═══════════════════════════════════════════
#  PROCESS FRONT
# ═══════════════════════════════════════════
def process_cnic_front(image_bytes):
    nparr = np.frombuffer(image_bytes, np.uint8)
    image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if image is None: raise HTTPException(status_code=400, detail="Invalid image")
    warnings = []
    print("\n"+"="*60+"\nPROCESSING: CNIC FRONT SIDE\n"+"="*60)
    corrected, was_corrected = perspective_correction(image)
    doc, detected_side, yolo_conf = detect_cnic_yolo(corrected)
    if detected_side == "Back":
        warnings.append(f"YOLO detected Back (conf={yolo_conf:.2f}), processing as Front.")
    lines, details, ocr_ok = perform_ocr(doc, OCR_CONF_FRONT)
    if not ocr_ok: warnings.append(f"Low OCR — only {len(lines)} lines.")
    is_cnic_ok, rejection, ia = verify_is_cnic(corrected)
    ia['perspective_fixed']  = was_corrected
    ia['yolo_detected_side'] = detected_side
    ia['yolo_confidence']    = round(yolo_conf, 3)
    if not is_cnic_ok:
        return sanitize({"error":True,"not_a_cnic":True,"status":"invalid_cnic","confidence":0,
                         "rejection_reason":rejection,"extracted":{},"photo_base64":None,
                         "raw_text":lines,"regions":{},"quality_warnings":warnings,
                         "validation":{"overall_passed":False,"errors":[rejection],"warnings":[],"checks":{}},
                         "image_analysis":ia})
    name, father = parse_name_and_father(lines)
    dates        = parse_dates(lines)
    gender       = parse_gender(lines)
    cnic         = parse_cnic_number(lines)
    address      = parse_address(lines)
    photo        = extract_photo(doc)
    regions      = build_regions(lines, details)
    age_chk    = validate_age(dates.get('dob'))
    expiry_chk = validate_expiry(dates.get('expiry'))
    fmt_chk    = validate_cnic_format(cnic)
    gender_chk = validate_gender_from_cnic(cnic)
    if not gender and gender_chk.get('gender_from_cnic'):
        gender = gender_chk['gender_from_cnic']
    has_data   = bool(cnic or name or dates.get('dob'))
    status     = determine_status(age_chk['passed'], expiry_chk['passed'], fmt_chk['passed'], has_data)
    confidence = compute_confidence(lines, cnic, name, dates.get('dob'), dates.get('expiry'))
    errors = []
    if not age_chk['passed']    and age_chk.get('age') is not None:   errors.append(age_chk['note'])
    if not expiry_chk['passed'] and expiry_chk.get('days_remaining') is not None: errors.append(expiry_chk['note'])
    if not fmt_chk['passed']:   warnings.append(fmt_chk['note'])
    return sanitize({
        "status":status, "confidence":confidence, "photo_base64":photo,
        "detected_side":detected_side,
        "extracted":{"cnic_number":cnic,"name":name,"father_name":father,
                     "gender":gender,"date_of_birth":dates.get('dob'),
                     "date_of_issue":dates.get('issue'),"date_of_expiry":dates.get('expiry'),
                     "address":address},
        "validation":{"overall_passed":status=="valid","errors":errors,"warnings":warnings,
                      "checks":{"age":age_chk,"expiry":expiry_chk,
                                "cnic_format":fmt_chk,"gender_derived":gender_chk}},
        "image_analysis":ia,"regions":regions,"raw_text":lines,
        "quality_warnings":warnings,"extraction_method":"custom_yolo_ocr_pipeline",
    })

# ═══════════════════════════════════════════
#  PROCESS BACK
# ═══════════════════════════════════════════
def process_cnic_back(image_bytes):
    nparr = np.frombuffer(image_bytes, np.uint8)
    image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if image is None: raise HTTPException(status_code=400, detail="Invalid image")
    warnings = []
    print("\n"+"="*60+"\nPROCESSING: CNIC BACK SIDE\n"+"="*60)
    corrected, was_corrected = perspective_correction(image)
    doc, detected_side, yolo_conf = detect_cnic_yolo(corrected)
    if detected_side == "Front":
        warnings.append(f"YOLO detected Front (conf={yolo_conf:.2f}), processing as Back.")
    lines, details, ocr_ok = perform_ocr(doc, OCR_CONF_BACK)
    if not ocr_ok: warnings.append(f"Low OCR — only {len(lines)} lines.")
    is_cnic_ok, rejection, ia = verify_is_cnic(corrected)
    ia['perspective_fixed']  = was_corrected
    ia['yolo_detected_side'] = detected_side
    ia['yolo_confidence']    = round(yolo_conf, 3)
    if not is_cnic_ok:
        return sanitize({"error":True,"not_a_cnic":True,"status":"invalid_cnic","confidence":0,
                         "rejection_reason":rejection,"extracted":{},"raw_text":lines,
                         "regions":{},"quality_warnings":warnings,
                         "validation":{"overall_passed":False,"errors":[rejection],"warnings":[],"checks":{}},
                         "image_analysis":ia})
    barcode_data, barcode_type = extract_barcode(doc)
    cnic     = parse_cnic_number(lines)
    address  = parse_address(lines)
    _, urdu_addr = parse_back_urdu_address(lines)
    regions  = build_regions(lines, details)
    fmt_chk  = validate_cnic_format(cnic)
    confidence = compute_confidence(lines, cnic, None, None, None)
    return sanitize({
        "status":"valid" if fmt_chk['passed'] else "data_incomplete",
        "confidence":confidence, "detected_side":detected_side,
        "extracted":{"cnic_number":cnic,"address_en":address,
                     "address_urdu":urdu_addr,"barcode_data":barcode_data,
                     "barcode_type":barcode_type},
        "validation":{"overall_passed":fmt_chk['passed'],
                      "errors":[] if fmt_chk['passed'] else [fmt_chk['note']],
                      "warnings":warnings,
                      "checks":{"cnic_format":fmt_chk,
                                "barcode":{"passed":barcode_data is not None,
                                           "note":"Barcode found ✓" if barcode_data else "No barcode"}}},
        "image_analysis":ia,"regions":regions,"raw_text":lines,
        "quality_warnings":warnings,"extraction_method":"custom_yolo_ocr_pipeline",
    })

# ═══════════════════════════════════════════
#  AUTO
# ═══════════════════════════════════════════
def process_cnic_auto(image_bytes):
    nparr = np.frombuffer(image_bytes, np.uint8)
    image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if image is None: raise HTTPException(status_code=400, detail="Invalid image")
    corrected, _ = perspective_correction(image)
    side, conf   = auto_detect_side(corrected)
    print(f"\nAuto-Detect: {side} (conf={conf:.3f})")
    result = process_cnic_back(image_bytes) if side=="Back" else process_cnic_front(image_bytes)
    result['auto_detected_side']        = side
    result['auto_detection_confidence'] = round(conf, 3)
    return result

# ═══════════════════════════════════════════
#  ROUTES — @router use ho raha hai, @app nahi
# ═══════════════════════════════════════════
@router.get("/health")
async def health():
    return sanitize({
        "status":"healthy",
        "models":{
            "easyocr":    {"available":EASYOCR_AVAILABLE,"loaded":reader is not None},
            "custom_yolo":{"available":YOLO_AVAILABLE,
                           "model_file_exists":os.path.exists(CUSTOM_YOLO_MODEL_PATH),
                           "model_loaded":yolo_model is not None,"classes":YOLO_CLASSES},
            "barcode":    {"available":BARCODE_AVAILABLE},
        },
        "settings":{
            "ocr_conf_front":OCR_CONF_FRONT,"ocr_conf_back":OCR_CONF_BACK,
            "yolo_conf":YOLO_CONF,"yolo_min_coverage":YOLO_MIN_COVERAGE,
        }
    })

@router.post("/process/front")
async def api_front(file: UploadFile = File(...)):
    try:    return JSONResponse(content=process_cnic_front(await file.read()))
    except HTTPException: raise
    except Exception as e: return JSONResponse(status_code=500, content={"error":True,"message":str(e)})

@router.post("/process/back")
async def api_back(file: UploadFile = File(...)):
    try:    return JSONResponse(content=process_cnic_back(await file.read()))
    except HTTPException: raise
    except Exception as e: return JSONResponse(status_code=500, content={"error":True,"message":str(e)})

@router.post("/process/auto")
async def api_auto(file: UploadFile = File(...)):
    try:    return JSONResponse(content=process_cnic_auto(await file.read()))
    except HTTPException: raise
    except Exception as e: return JSONResponse(status_code=500, content={"error":True,"message":str(e)})

@router.post("/process/both")
async def api_both(front: UploadFile = File(...), back: UploadFile = File(...)):
    try:    return JSONResponse(content={"front":process_cnic_front(await front.read()),
                                          "back": process_cnic_back(await back.read())})
    except HTTPException: raise
    except Exception as e: return JSONResponse(status_code=500, content={"error":True,"message":str(e)})

# ═══════════════════════════════════════════
#  NOTE: Koi if __name__ == "__main__" nahi — main.py handle karega
# ═══════════════════════════════════════════