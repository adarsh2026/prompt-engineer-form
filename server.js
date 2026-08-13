const express = require('express');
const session = require('express-session');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const SESSION_SECRET = process.env.SESSION_SECRET || 'change-this-secret-in-production';

const DATA_FILE = path.join(__dirname, 'data', 'candidates.json');
const UPLOADS_DIR = path.join(__dirname, 'uploads');

// ---------- 15 Prompt Engineering Questions ----------
const QUESTIONS = [
  "Prompt engineering kya hota hai, apne shabdon mein samjhaiye?",
  "Zero-shot aur few-shot prompting mein kya fark hai?",
  "Chain-of-thought prompting kya hai aur kab use karte hain?",
  "Ek prompt likhiye jo AI se ek professional email likhwaye.",
  "Agar AI ka output expected format mein nahi aa raha to prompt kaise fix karenge?",
  "System prompt aur user prompt mein kya antar hai?",
  "Aapne kis AI tool/model ke saath sabse zyada kaam kiya hai? (ChatGPT, Claude, Gemini, etc.)",
  "Hallucination kya hota hai AI models mein, aur ise prompting se kaise kam karte hain?",
  "Temperature aur top-p parameters kya control karte hain?",
  "Ek complex task ko chhote steps mein todkar prompt kaise design karenge?",
  "Kisi prompt ko debug/improve kaise karte hain jab result achha na aaye?",
  "Role-based prompting (persona assign karna) kya hota hai? Example dijiye.",
  "RAG (Retrieval Augmented Generation) ke baare mein aap kya jaante hain?",
  "Prompt injection attack kya hota hai aur usse kaise bachein?",
  "Prompt engineering mein apna experience/portfolio kaise describe karenge?"
];

// ---------- Ensure data files exist ----------
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
if (!fs.existsSync(path.dirname(DATA_FILE))) fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, '[]');

function readCandidates() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  } catch (e) {
    return [];
  }
}

function writeCandidates(list) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(list, null, 2));
}

// ---------- Multer setup for resume upload ----------
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const uniqueName = crypto.randomBytes(8).toString('hex') + '-' + Date.now() + path.extname(file.originalname);
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf', '.doc', '.docx'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error('Sirf PDF, DOC ya DOCX resume allowed hai'));
  }
});

// ---------- App setup ----------
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use('/static', express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 } // 1 day
}));

function requireAuth(req, res, next) {
  if (req.session && req.session.isAdmin) return next();
  return res.redirect('/admin/login');
}

// ---------- Public: Application Form ----------
app.get('/', (req, res) => {
  res.render('form', { questions: QUESTIONS, error: null });
});

app.post('/submit', (req, res) => {
  upload.single('resume')(req, res, (err) => {
    if (err) {
      return res.render('form', { questions: QUESTIONS, error: err.message });
    }
    if (!req.file) {
      return res.render('form', { questions: QUESTIONS, error: 'Resume upload karna zaroori hai.' });
    }

    const { name, email, phone } = req.body;
    if (!name || !email) {
      fs.unlinkSync(req.file.path); // cleanup uploaded file
      return res.render('form', { questions: QUESTIONS, error: 'Naam aur Email zaroori hai.' });
    }

    const answers = QUESTIONS.map((q, i) => ({
      question: q,
      answer: (req.body['q' + i] || '').trim()
    }));

    const candidates = readCandidates();
    const newCandidate = {
      id: Date.now().toString(36) + crypto.randomBytes(4).toString('hex'),
      name: name.trim(),
      email: email.trim(),
      phone: (phone || '').trim(),
      answers,
      resumeFile: req.file.filename,
      resumeOriginalName: req.file.originalname,
      status: 'Pending',
      submittedAt: new Date().toISOString()
    };
    candidates.unshift(newCandidate);
    writeCandidates(candidates);

    res.redirect('/thank-you');
  });
});

app.get('/thank-you', (req, res) => {
  res.render('thankyou');
});

// ---------- Admin: Login ----------
app.get('/admin/login', (req, res) => {
  res.render('login', { error: null });
});

app.post('/admin/login', (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) {
    req.session.isAdmin = true;
    return res.redirect('/admin');
  }
  res.render('login', { error: 'Galat password. Dobara try karein.' });
});

app.get('/admin/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/admin/login'));
});

// ---------- Admin: Dashboard ----------
app.get('/admin', requireAuth, (req, res) => {
  const candidates = readCandidates();
  res.render('admin', { candidates });
});

app.get('/admin/candidate/:id', requireAuth, (req, res) => {
  const candidates = readCandidates();
  const candidate = candidates.find(c => c.id === req.params.id);
  if (!candidate) return res.status(404).send('Candidate nahi mila');
  res.render('candidate', { candidate });
});

app.post('/admin/candidate/:id/status', requireAuth, (req, res) => {
  const candidates = readCandidates();
  const candidate = candidates.find(c => c.id === req.params.id);
  if (candidate) {
    candidate.status = req.body.status;
    writeCandidates(candidates);
  }
  res.redirect('/admin/candidate/' + req.params.id);
});

// Protected resume download - only admin can access
app.get('/admin/resume/:filename', requireAuth, (req, res) => {
  const filePath = path.join(UPLOADS_DIR, req.params.filename);
  if (!fs.existsSync(filePath)) return res.status(404).send('File nahi mili');
  res.sendFile(filePath);
});

app.listen(PORT, () => {
  console.log(`Server chal raha hai: http://localhost:${PORT}`);
});
