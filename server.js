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
  "In simple words, what is a 'prompt' when using AI tools like ChatGPT or Claude?",
  "Which AI tools have you used before? (ChatGPT, Claude, Gemini, etc.)",
  "Write an example prompt you'd use to ask an AI to summarize a long article.",
  "If an AI gives you a confusing or wrong answer, what would you try next?",
  "What does it mean to give an AI 'clear instructions'? Why does it matter?",
  "Why do you think giving an AI a few examples can help it give a better answer?",
  "What's the difference between asking AI a short question vs. giving it detailed instructions?",
  "Have you ever asked an AI to act like a specific person or expert (e.g. 'act as a teacher')? What happened?",
  "Why might an AI sometimes give an answer that isn't true or accurate?",
  "If you wanted an AI to reply in a certain tone (funny, formal, simple), how would you ask for that?",
  "How would you break a big task into smaller steps before asking an AI for help with it?",
  "What do you enjoy most about working with AI tools?",
  "Have you ever rewritten a prompt a few times to get a better result? What did you change?",
  "In your opinion, what makes someone good at writing prompts for AI?",
  "Tell us a bit about your interest in prompt engineering as a career."
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

    const timeTakenSeconds = parseInt(req.body.timeTaken, 10) || 0;

    const candidates = readCandidates();
    const newCandidate = {
      id: Date.now().toString(36) + crypto.randomBytes(4).toString('hex'),
      name: name.trim(),
      email: email.trim(),
      phone: (phone || '').trim(),
      answers,
      timeTakenSeconds,
      resumeFile: req.file.filename,
      resumeOriginalName: req.file.originalname,
      status: 'Pending',
      submittedAt: new Date().toISOString()
    };
    candidates.unshift(newCandidate);
    writeCandidates(candidates);

    req.session.justApplied = true;
    res.redirect('/thank-you');
  });
});

app.get('/thank-you', (req, res) => {
  if (!req.session || !req.session.justApplied) {
    return res.redirect('/');
  }
  req.session.justApplied = false; // one-time view, refresh won't keep showing it after leaving
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