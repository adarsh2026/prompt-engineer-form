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
  "In your own words, what is prompt engineering?",
  "What is the difference between zero-shot and few-shot prompting?",
  "What is chain-of-thought prompting and when do you use it?",
  "Write a prompt that would get an AI to draft a professional email.",
  "If an AI's output isn't coming in the expected format, how would you fix the prompt?",
  "What is the difference between a system prompt and a user prompt?",
  "Which AI tool/model have you worked with the most? (ChatGPT, Claude, Gemini, etc.)",
  "What is hallucination in AI models, and how can prompting reduce it?",
  "What do temperature and top-p parameters control?",
  "How would you design a prompt that breaks a complex task into smaller steps?",
  "How do you debug/improve a prompt when the result isn't good?",
  "What is role-based prompting (assigning a persona)? Give an example.",
  "What do you know about RAG (Retrieval Augmented Generation)?",
  "What is a prompt injection attack, and how do you protect against it?",
  "How would you describe your experience/portfolio in prompt engineering?"
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
    else cb(new Error('Only PDF, DOC or DOCX resumes are allowed'));
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
      return res.render('form', { questions: QUESTIONS, error: 'Resume upload is required.' });
    }

    const { name, email, phone } = req.body;
    if (!name || !email) {
      fs.unlinkSync(req.file.path); // cleanup uploaded file
      return res.render('form', { questions: QUESTIONS, error: 'Name and Email are required.' });
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
  res.render('login', { error: 'Wrong password. Please try again.' });
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
  if (!candidate) return res.status(404).send('Candidate not found');
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
  if (!fs.existsSync(filePath)) return res.status(404).send('File not found');
  res.sendFile(filePath);
});

app.listen(PORT, () => {
  console.log(`Server running at: http://localhost:${PORT}`);
});