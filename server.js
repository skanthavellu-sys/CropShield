const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
  ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)
  : require("./firebase-service-account.json");

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();












const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;

const DATA_DIR = path.join(__dirname, "data");
const SESSIONS_FILE = path.join(DATA_DIR, "sessions.json");

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

if (!fs.existsSync(SESSIONS_FILE)) fs.writeFileSync(SESSIONS_FILE, "[]");

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

function readJSON(file) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); }
  catch { return []; }
}
function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}
function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return { salt, hash };
}
function verifyPassword(password, storedHash, salt) {
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(storedHash, "hex"));
}
function newToken() {
  return crypto.randomBytes(32).toString("hex");
}
function getToken(req) {
  const h = req.headers.authorization || "";
  return h.startsWith("Bearer ") ? h.slice(7) : null;
}
async function auth(req, res, next) {
  const token = getToken(req);
  const sessions = readJSON(SESSIONS_FILE);
  const session = sessions.find(s => s.token === token);
  if (!session) return res.status(401).json({ error: "Please log in." });
  const userDoc = await db.collection("users").doc(session.userId).get();

  if (!userDoc.exists) {
   return res.status(401).json({ error: "Account not found." });
}

const user = userDoc.data();
  req.user = user;
  req.token = token;
  next();
}

app.post("/api/register", async (req, res) => {
  const { name, email, password, location, state, district, latitude, longitude } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: "Name, email and password are required." });
  if (password.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters." });

 
const cleanEmail = email.trim().toLowerCase();

const existingUserSnapshot = await db
  .collection("users")
  .where("email", "==", cleanEmail)
  .limit(1)
  .get();

if (!existingUserSnapshot.empty) {
  return res.status(409).json({ error: "An account with this email already exists." });
}

  const { salt, hash } = hashPassword(password);
  const user = {
    id: crypto.randomUUID(),
    name: name.trim(),
    email: cleanEmail,
    passwordHash: hash,
    passwordSalt: salt,
    location: location ? location.trim() : "",
    state: state || "",
    district: district || "",
    latitude: Number.isFinite(Number(latitude)) ? Number(latitude) : null,
    longitude: Number.isFinite(Number(longitude)) ? Number(longitude) : null,
    createdAt: new Date().toISOString()
  };
  await db.collection("users").doc(user.id).set(user);


  const token = newToken();
  const sessions = readJSON(SESSIONS_FILE);
  sessions.push({ token, userId: user.id, createdAt: new Date().toISOString() });
  writeJSON(SESSIONS_FILE, sessions);

  res.json({ token, user: publicUser(user) });
});

 app.post("/api/login",async (req, res) =>  {
  const { email, password } = req.body;
 const cleanEmail = String(email || "").trim().toLowerCase();

const snapshot = await db
  .collection("users")
  .where("email", "==", cleanEmail)
  .limit(1)
  .get();

const user = snapshot.empty ? null : snapshot.docs[0].data();
  if (!user || !verifyPassword(String(password || ""), user.passwordHash, user.passwordSalt)) {
    return res.status(401).json({ error: "Incorrect email or password." });
  }

  const token = newToken();
  const sessions = readJSON(SESSIONS_FILE);
  sessions.push({ token, userId: user.id, createdAt: new Date().toISOString() });
  writeJSON(SESSIONS_FILE, sessions);
  res.json({ token, user: publicUser(user) });
});

app.post("/api/logout", auth, (req, res) => {
  const sessions = readJSON(SESSIONS_FILE).filter(s => s.token !== req.token);
  writeJSON(SESSIONS_FILE, sessions);
  res.json({ ok: true });
});

app.get("/api/me", auth, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

app.put("/api/profile", auth,  async (req, res) => {
  const userDoc = await db.collection("users").doc(req.user.id).get();

if (!userDoc.exists) {
  return res.status(404).json({ error: "User not found." });
}

const user = userDoc.data();
  if (req.body.name) user.name = String(req.body.name).trim();
  if (req.body.location !== undefined) user.location = String(req.body.location).trim();
  if (req.body.state !== undefined) user.state = String(req.body.state);
  if (req.body.district !== undefined) user.district = String(req.body.district);
  if (req.body.latitude !== undefined) user.latitude = Number(req.body.latitude);
  if (req.body.longitude !== undefined) user.longitude = Number(req.body.longitude);



await db.collection("users").doc(user.id).set(user, { merge: true });

res.json({ user: publicUser(user) });
});

function publicUser(u) {
  return {
    id: u.id, name: u.name, email: u.email, location: u.location || "",
    state: u.state || "", district: u.district || "",
    latitude: u.latitude ?? null, longitude: u.longitude ?? null,
    createdAt: u.createdAt
  };
}

/*
  REAL RAINFALL DATA
  ------------------
  This endpoint uses Open-Meteo's historical weather API for past rainfall
  and its forecast API for upcoming precipitation.

  The browser NEVER calls the weather service directly; this server does it.
  That keeps the app's data logic in one place.

  Important:
  - Historical precipitation is API data, not a hard-coded number.
  - It is not the same as a physical rain-gauge reading at the farm.
  - For a production insurance product, replace this adapter with licensed/
    official station observations from MET Malaysia / myMETdata.
*/

function validCoordinate(value, min, max) {
  const n = Number(value);
  return Number.isFinite(n) && n >= min && n <= max;
}


const MALAYSIA_LOCATIONS = {
  "Johor": {
    "Johor Bahru":[1.4927,103.7414],"Batu Pahat":[1.8548,102.9325],"Kluang":[2.0305,103.3169],
    "Kota Tinggi":[1.7381,103.8999],"Mersing":[2.4312,103.8405],"Muar":[2.0442,102.5689],
    "Pontian":[1.4854,103.3898],"Segamat":[2.5148,102.8158],"Tangkak":[2.2673,102.5452]
  },
  "Kedah": {
    "Alor Setar":[6.1184,100.3685],"Baling":[5.6797,100.9190],"Bandar Baharu":[5.1196,100.5024],
    "Kubang Pasu":[6.2868,100.4214],"Kulim":[5.3649,100.5618],"Langkawi":[6.3500,99.8000],
    "Padang Terap":[6.2500,100.6500],"Pendang":[5.9900,100.4800],"Sik":[5.8200,100.7300],
    "Yan":[5.8100,100.3700]
  },
  "Kelantan": {
    "Kota Bharu":[6.1254,102.2381],"Bachok":[6.0667,102.4000],"Gua Musang":[4.8823,101.9680],
    "Jeli":[5.7000,101.8400],"Machang":[5.7667,102.2167],"Pasir Mas":[6.0500,102.1390],
    "Pasir Puteh":[5.8333,102.4000],"Tanah Merah":[5.8000,102.1500],"Tumpat":[6.2000,102.1667]
  },
  "Melaka": {
    "Alor Gajah":[2.3804,102.2089],"Jasin":[2.3091,102.4380],"Melaka Tengah":[2.1896,102.2501]
  },
  "Negeri Sembilan": {
    "Seremban":[2.7258,101.9424],"Jelebu":[2.9500,102.0700],"Kuala Pilah":[2.7389,102.2487],
    "Port Dickson":[2.5228,101.7956],"Rembau":[2.5853,102.0905],"Tampin":[2.4697,102.2300]
  },
  "Pahang": {
    "Kuantan":[3.8077,103.3260],"Bentong":[3.5221,101.9083],"Bera":[3.2800,102.4500],
    "Cameron Highlands":[4.4700,101.3800],"Jerantut":[3.9400,102.3600],"Maran":[3.5800,102.7700],
    "Pekan":[3.4900,103.3900],"Raub":[3.7900,101.8600],"Rompin":[2.8100,103.4900],"Temerloh":[3.4500,102.4200]
  },
  "Penang": {
    "George Town":[5.4141,100.3288],"Seberang Perai":[5.4200,100.4300]
  },
  "Perak": {
    "Ipoh":[4.5975,101.0901],"Batang Padang":[4.0000,101.2500],"Hilir Perak":[3.9900,100.9000],
    "Kinta":[4.6000,101.1000],"Kerian":[5.0500,100.5000],"Kuala Kangsar":[4.7700,100.9300],
    "Larut Matang dan Selama":[4.8500,100.7300],"Manjung":[4.1800,100.6500],"Perak Tengah":[4.4500,100.9500]
  },
  "Perlis": {"Kangar":[6.4414,100.1986]},
  "Sabah": {
    "Kota Kinabalu":[5.9804,116.0735],"Beaufort":[5.3500,115.7500],"Keningau":[5.3400,116.1600],
    "Kota Belud":[6.3500,116.4300],"Lahad Datu":[5.0300,118.3300],"Sandakan":[5.8400,118.1179],
    "Semporna":[4.4800,118.6100],"Tawau":[4.2448,117.8912]
  },
  "Sarawak": {
    "Kuching":[1.5533,110.3592],"Bau":[1.4200,110.1700],"Bintulu":[3.1667,113.0333],
    "Kapit":[2.0167,112.9333],"Limbang":[4.7500,115.0000],"Miri":[4.3995,113.9914],
    "Samarahan":[1.4600,110.4700],"Sibu":[2.2870,111.8300],"Sri Aman":[1.2400,111.4600]
  },
  "Selangor": {
    "Petaling":[3.1000,101.6200],"Klang":[3.0449,101.4456],"Kuala Langat":[2.8115,101.5000],
    "Kuala Selangor":[3.3330,101.2500],"Sabak Bernam":[3.7700,100.9900],"Sepang":[2.6931,101.7498],
    "Ulu Selangor":[3.6500,101.5500],"Gombak":[3.3000,101.6500],"Hulu Langat":[3.1200,101.7900]
  },
  "Terengganu": {
    "Kuala Terengganu":[5.3302,103.1408],"Besut":[5.8300,102.5500],"Dungun":[4.7561,103.4190],
    "Hulu Terengganu":[5.0500,102.8300],"Kemaman":[4.2300,103.4300],"Marang":[5.2000,103.2000],
    "Setiu":[5.5500,102.7300]
  },
  "Kuala Lumpur": {"Kuala Lumpur":[3.1390,101.6869]},
  "Putrajaya": {"Putrajaya":[2.9264,101.6964]},
  "Labuan": {"Labuan":[5.2831,115.2308]}
};

app.get("/api/locations", (req, res) => {
  const state = String(req.query.state || "");
  if (!state) return res.json({ states:Object.keys(MALAYSIA_LOCATIONS) });
  const districts = MALAYSIA_LOCATIONS[state];
  if (!districts) return res.status(404).json({ error:"State not found." });
  res.json({
    state,
    districts:Object.entries(districts).map(([name, coords]) => ({
      name, latitude:coords[0], longitude:coords[1]
    }))
  });
});

app.get("/api/rainfall", async (req, res) => {
  const lat = Number(req.query.lat);
  const lon = Number(req.query.lon);

  if (!validCoordinate(lat, -90, 90) || !validCoordinate(lon, -180, 180)) {
    return res.status(400).json({ error: "Enter a valid latitude and longitude." });
  }

  try {
    const today = new Date();
    const end = new Date(today);
    end.setDate(end.getDate() - 1); // yesterday: avoids incomplete current-day history
    const start = new Date(end);
    start.setDate(start.getDate() - 29);

    const fmt = d => d.toISOString().slice(0, 10);
    const startDate = fmt(start);
    const endDate = fmt(end);

    const historyURL =
      `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}` +
      `&start_date=${startDate}&end_date=${endDate}&daily=precipitation_sum&timezone=Asia%2FKuala_Lumpur`;

    const forecastURL =
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      `&daily=precipitation_sum&forecast_days=7&timezone=Asia%2FKuala_Lumpur`;

    const [historyResp, forecastResp] = await Promise.all([
      fetch(historyURL),
      fetch(forecastURL)
    ]);

    if (!historyResp.ok) throw new Error("Historical rainfall service returned an error.");
    if (!forecastResp.ok) throw new Error("Forecast rainfall service returned an error.");

    const history = await historyResp.json();
    const forecast = await forecastResp.json();

    const historicalDaily = (history.daily?.time || []).map((date, i) => ({
      date,
      mm: Number(history.daily.precipitation_sum?.[i] || 0)
    }));

    const forecastDaily = (forecast.daily?.time || []).map((date, i) => ({
      date,
      mm: Number(forecast.daily.precipitation_sum?.[i] || 0)
    }));

    const actual30 = Number(historicalDaily.reduce((sum, d) => sum + d.mm, 0).toFixed(1));
    const expected7 = Number(forecastDaily.reduce((sum, d) => sum + d.mm, 0).toFixed(1));

    res.json({
      source: "Open-Meteo",
      sourceType: "historical API + forecast API",
      note: "Historical rainfall is API weather data for the selected coordinates. It is not a direct rain-gauge measurement.",
      coordinates: { latitude: lat, longitude: lon },
      historical: {
        startDate,
        endDate,
        days: historicalDaily.length,
        totalMm: actual30,
        daily: historicalDaily
      },
      forecast: {
        days: forecastDaily.length,
        totalMm: expected7,
        daily: forecastDaily
      },
      fetchedAt: new Date().toISOString()
    });
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: "Could not retrieve rainfall data right now." });
  }
});

// Simple in-memory claim storage for the prototype.
const claims = new Map();

app.get("/api/claims", auth, (req, res) => {
  res.json({ claims: claims.get(req.user.id) || [] });
});

app.post("/api/claims", auth, (req, res) => {
  const { policyId, crop, reason, amount, bankName, accountHolderName, bankAccountNumber } = req.body;
  if (!bankName || !accountHolderName || !bankAccountNumber) {
  return res.status(400).json({ error: "Bank name, account holder name and bank account number are required." });
}

if (!/^\d+$/.test(String(bankAccountNumber))) {
  return res.status(400).json({ error: "Bank account number must contain numbers only." });
}
  if (!crop || !reason || !amount) return res.status(400).json({ error: "Crop, reason and amount are required." });

  const list = claims.get(req.user.id) || [];
const claim = {
  id: "CLM-" + Date.now(),
  policyId: policyId || "Not issued",
  crop,
  reason,
  amount: Number(amount),
  bankName,
  accountHolderName,
  bankAccountNumber,
  status: "Submitted"
};
  list.unshift(claim);
  claims.set(req.user.id, list);
  res.json({ claim });
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`CropShield running at http://localhost:${PORT}`);
});
