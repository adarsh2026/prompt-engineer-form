# Prompt Engineer Hiring Form

Job application form (15 optional questions + resume upload) with password-protected admin panel.

## ⚠️ Zaroori Baat — Free Render Plan Ki Limitation

Render ke **free web service** mein disk *ephemeral* hota hai — matlab jab bhi service **restart/redeploy/sleep** hoti hai (free tier 15 min inactivity ke baad sleep ho jaati hai), **uploaded resumes aur saved data (`data/candidates.json`) delete ho sakta hai**.

**Solution (recommended):** Render pe **Persistent Disk** add karein (paid feature, ~$1/month se start, "Disks" section mein Render dashboard se). Isse `/uploads` aur `/data` folders permanently save rahenge.

Bina persistent disk ke bhi app kaam karegi, bas restart hone par purana data khatam ho sakta hai — testing/demo ke liye theek hai, real hiring ke liye persistent disk zaroor lein.

## Local Mein Test Karna

```bash
npm install
ADMIN_PASSWORD=yourpassword SESSION_SECRET=randomstring npm start
```

Phir browser mein `http://localhost:3000` kholein.

## Render Par Deploy Karne Ke Steps

1. **GitHub pe push karein**: Is poore folder ko GitHub repository mein push karein.
2. **Render.com** pe jaake login/signup karein.
3. Dashboard pe **"New +" → "Web Service"** click karein.
4. Apna GitHub repo connect karein.
5. Settings bharein:
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: Free (ya paid, agar persistent disk chahiye)
6. **Environment Variables** add karein (Render dashboard → Environment tab):
   - `ADMIN_PASSWORD` = apna strong password
   - `SESSION_SECRET` = koi bhi random lambi string (e.g. `openssl rand -hex 32` se generate kar sakte hain)
7. (Optional but recommended) **Disks** tab mein ek persistent disk add karein, mount path `/opt/render/project/src/uploads` aur ek aur `/opt/render/project/src/data` ke liye (ya poore project folder ko mount karein) — taaki data safe rahe.
8. **"Create Web Service"** click karein — Render automatically build + deploy kar dega.
9. Kuch minute mein aapko ek live URL milega: `https://apka-app-name.onrender.com`

## URLs

- `/` — Candidate application form (share karne wala public link)
- `/admin/login` — Admin login (password wahi jo `ADMIN_PASSWORD` env var mein set kiya)
- `/admin` — Saare candidates ki table
- `/admin/candidate/:id` — Ek candidate ke saare answers + resume

## Structure

```
server.js           → Saara backend logic
views/               → EJS templates (form, admin, login, candidate, thank-you)
public/style.css     → Styling
uploads/             → Uploaded resumes yahan save hote hain
data/candidates.json → Saara submitted data yahan JSON format mein save hota hai
```
