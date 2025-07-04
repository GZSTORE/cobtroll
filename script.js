const express = require("express");
const axios = require("axios");
const path = require("path");
const cookieParser = require("cookie-parser");
const bcrypt = require("bcryptjs");
const app = express();

const PORT = 3000;

const PTERO_API = "https://panel.zraxtur.my.id";
const API_KEY = "ptla_ncEzIxtGsxsFCZZEwoobgWrtyobelbMBNpO9BYcXnCx";
const NEST_ID = 1;
const EGG_ID = 4;
const LOCATION_ID = 1;
const NODE_ID = 1;
const FIXED_RAM_MB = 1536;
const FIXED_DISK_MB = 3072;
const FIXED_CPU = 100;

const users = {}; // penyimpanan sementara

app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));

function auth(req, res, next) {
  const user = users[req.cookies?.email];
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  req.user = user;
  next();
}

// === REGISTER ===
app.post("/register", async (req, res) => {
  const { username, email, password } = req.body;
  if (users[email]) return res.status(400).json({ error: "Email sudah terdaftar" });

  try {
    const response = await axios.post(
      `${PTERO_API}/api/application/users`,
      {
        username,
        email,
        first_name: "User",
        last_name: "Auto",
        password,
      },
      {
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
      }
    );

    const hashed = await bcrypt.hash(password, 10);
    users[email] = {
      email,
      username,
      password: hashed,
      ptero_id: response.data.attributes.id,
    };

    res.cookie("email", email);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.response?.data || err.message });
  }
});

// === LOGIN ===
app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  const user = users[email];
  if (!user) return res.status(404).json({ error: "User tidak ditemukan" });

  const match = await bcrypt.compare(password, user.password);
  if (!match) return res.status(401).json({ error: "Password salah" });

  res.cookie("email", email);
  res.json({ success: true });
});

// === CREATE SERVER ===
app.post("/createserver", auth, async (req, res) => {
  const { email, username, name } = req.body;
  const serverName = name || username;

  try {
    const user = req.user;

    // Cek server milik user
    const allServers = await axios.get(`${PTERO_API}/api/application/servers`, {
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        Accept: "application/json",
      },
    });

    const userServers = allServers.data.data.filter(
      s => s.attributes.user === user.ptero_id
    );

    if (userServers.length > 0) {
      return res.status(403).json({ error: "Anda sudah memiliki 1 server" });
    }

    // Ambil allocation valid dari node ID 1
    const allocRes = await axios.get(`${PTERO_API}/api/application/nodes/${NODE_ID}/allocations`, {
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        Accept: "application/json",
      },
    });

    const allocation = allocRes.data.data.find(a => !a.attributes.assigned);
    if (!allocation) return res.status(400).json({ error: "Tidak ada allocation yang tersedia" });

    // Buat server
    const response = await axios.post(
      `${PTERO_API}/api/application/servers`,
      {
        name: serverName,
        user: user.ptero_id,
        egg: EGG_ID,
        nest: NEST_ID,
        limits: {
          memory: FIXED_RAM_MB,
          swap: 0,
          disk: FIXED_DISK_MB,
          io: 500,
          cpu: FIXED_CPU,
        },
        feature_limits: {
          databases: 0,
          backups: 0,
          allocations: 1,
        },
        allocation: {
          default: allocation.attributes.id,
        },
        docker_image: "ghcr.io/pterodactyl/yolks:java_17", // image default untuk Java
        startup: "java -Xms128M -Xmx{{SERVER_MEMORY}}M -jar server.jar",
        environment: {
          SERVER_JARFILE: "server.jar",
          VANILLA_VERSION: "latest",
          BUILD_NUMBER: "latest",
        },
      },
      {
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
      }
    );

    res.json({ success: true, server: response.data });
  } catch (err) {
    res.status(400).json({ success: false, error: err.response?.data || err.message });
  }
});

// === UPDATE EMAIL / PASSWORD ===
app.post("/update", auth, async (req, res) => {
  const { email, password } = req.body;
  const user = req.user;

  try {
    const hashed = await bcrypt.hash(password, 10);
    users[user.email].password = hashed;
    users[user.email].email = email;
    res.cookie("email", email);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: "Gagal update" });
  }
});

app.listen(PORT, () => console.log(`✅ Server aktif di http://localhost:${PORT}`));
