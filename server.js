
require("dotenv").config();

const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const multer = require("multer");

const app = express();

// Correção para o proxy da Netlify
if (process.env.NETLIFY) {
  app.set("trust proxy", 1);
}

const PORT = Number(process.env.PORT || 3000);
const IS_NETLIFY = Boolean(process.env.NETLIFY);
const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "embeds.json");
const UPLOAD_DIR = path.join(__dirname, "public", "uploads");
const IMAGE_TYPES = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif"
};

if (!IS_NETLIFY) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, JSON.stringify({ embeds: [] }, null, 2));
}

const uploadImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => Object.hasOwn(IMAGE_TYPES, file.mimetype)
    ? cb(null, true)
    : cb(new Error("Formato inválido. Use PNG, JPG, WEBP ou GIF."))
});

let blobsPromise;

async function getBlobs() {
  if (!blobsPromise) {
    blobsPromise = import("@netlify/blobs").then(({ getStore }) => ({
      data: getStore({ name: "r7-scripts-data", consistency: "strong" }),
      images: getStore({ name: "r7-scripts-images", consistency: "strong" })
    }));
  }
  return blobsPromise;
}

async function readData() {
  if (IS_NETLIFY) {
    const { data } = await getBlobs();
    return (await data.get("embeds", { type: "json" })) || { embeds: [] };
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    return { embeds: Array.isArray(parsed.embeds) ? parsed.embeds : [] };
  } catch {
    return { embeds: [] };
  }
}

async function writeData(value) {
  if (IS_NETLIFY) {
    const { data } = await getBlobs();
    await data.setJSON("embeds", value);
    return;
  }

  const temp = DATA_FILE + ".tmp";
  fs.writeFileSync(temp, JSON.stringify(value, null, 2));
  fs.renameSync(temp, DATA_FILE);
}

function cleanText(value, max = 300) {
  return String(value ?? "").trim().slice(0, max);
}

function validHttpUrl(value) {
  try {
    const parsed = new URL(String(value || "").trim());
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function validScriptValue(value) {
  const input = String(value || "").trim();
  return input.length > 0 && input.length <= 5000;
}

function safeEqual(a, b) {
  const aa = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}

function cookieValue(req, name) {
  const raw = req.headers.cookie || "";

  for (const part of raw.split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;

    if (part.slice(0, index).trim() === name) {
      return decodeURIComponent(part.slice(index + 1).trim());
    }
  }

  return "";
}

function signSession(exp) {
  const secret = process.env.SESSION_SECRET;

  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET precisa ter pelo menos 32 caracteres.");
  }

  const payload = Buffer.from(JSON.stringify({ admin: true, exp })).toString("base64url");
  const signature = crypto.createHmac("sha256", secret).update(payload).digest("base64url");

  return `${payload}.${signature}`;
}

function isAuthenticated(req) {
  const token = cookieValue(req, "r7_admin");
  const [payload, signature, extra] = token.split(".");

  if (!payload || !signature || extra) return false;

  const expected = crypto.createHmac(
    "sha256",
    process.env.SESSION_SECRET || ""
  ).update(payload).digest("base64url");

  if (!safeEqual(signature, expected)) return false;

  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return decoded.admin === true && Number(decoded.exp) > Date.now();
  } catch {
    return false;
  }
}

function isAdmin(req, res, next) {
  if (isAuthenticated(req)) return next();

  return res.status(401).json({
    error: "Acesso administrativo necessário."
  });
}

function cookieOptions() {
  return `Path=/; HttpOnly; SameSite=Lax; Max-Age=${8 * 60 * 60}${IS_NETLIFY || process.env.NODE_ENV === "production" ? "; Secure" : ""}`;
}

app.disable("x-powered-by");

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
      imgSrc: ["'self'", "https:", "data:"],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"]
    }
  }
}));

app.use(express.json({ limit: "200kb" }));

app.use("/api/admin/login", rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  standardHeaders: true,
  legacyHeaders: false
}));

app.use("/api/", rateLimit({
  windowMs: 60 * 1000,
  limit: 180,
  standardHeaders: true,
  legacyHeaders: false
}));

// Imagens enviadas: no Netlify ficam no armazenamento persistente Netlify Blobs.
app.get("/uploads/:filename", async (req, res, next) => {
  try {
    const filename = path.basename(req.params.filename);

    if (filename !== req.params.filename) return res.sendStatus(400);

    if (!IS_NETLIFY) {
      return res.sendFile(path.join(UPLOAD_DIR, filename));
    }

    const { images } = await getBlobs();
    const entry = await images.getWithMetadata(filename, {
      type: "arrayBuffer"
    });

    if (!entry || !entry.data) return res.sendStatus(404);

    res.set("Content-Type", entry.metadata?.contentType || "application/octet-stream");
    res.set("Cache-Control", "public, max-age=31536000, immutable");

    return res.send(Buffer.from(entry.data));
  } catch (error) {
    next(error);
  }
});

app.get("/api/config", (_req, res) => {
  res.json({
    tiktokConfigured: Boolean(process.env.TIKTOK_LINK),
    discordConfigured: Boolean(process.env.DISCORD_SERVER_LINK),
    tiktokLink: process.env.TIKTOK_LINK || "",
    discordLink: process.env.DISCORD_SERVER_LINK || ""
  });
});

app.get("/api/embeds", async (_req, res, next) => {
  try {
    const { embeds } = await readData();

    res.json(embeds.filter(e => e.published).map(({
      id,
      image,
      name,
      description,
      url,
      views
    }) => ({
      id,
      image,
      name,
      description,
      url,
      views
    })));
  } catch (error) {
    next(error);
  }
});

app.post("/api/embeds/:id/view", async (req, res, next) => {
  try {
    const data = await readData();
    const embed = data.embeds.find(e => e.id === req.params.id && e.published);

    if (!embed) {
      return res.status(404).json({ error: "Embed não encontrado." });
    }

    embed.views = (Number(embed.views) || 0) + 1;
    embed.lastViewedAt = new Date().toISOString();

    await writeData(data);

    res.json({ ok: true, views: embed.views });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/login", (req, res) => {
  const expected = process.env.ADMIN_ACCESS_CODE;
  const supplied = cleanText(req.body?.code, 100);

  if (!expected || !safeEqual(supplied, expected)) {
    return res.status(401).json({
      error: "Código de acesso incorreto."
    });
  }

  try {
    res.setHeader(
      "Set-Cookie",
      `r7_admin=${encodeURIComponent(signSession(Date.now() + 8 * 60 * 60 * 1000))}; ${cookieOptions()}`
    );

    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/admin/me", (req, res) => {
  res.json({ authenticated: isAuthenticated(req) });
});

app.post("/api/admin/logout", isAdmin, (_req, res) => {
  res.setHeader(
    "Set-Cookie",
    `r7_admin=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${IS_NETLIFY || process.env.NODE_ENV === "production" ? "; Secure" : ""}`
  );

  res.json({ ok: true });
});

app.get("/api/admin/embeds", isAdmin, async (_req, res, next) => {
  try {
    res.json((await readData()).embeds);
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/embeds", isAdmin, (req, res, next) => {
  uploadImage.single("imageFile")(req, res, error => {
    if (error) {
      return res.status(400).json({
        error: error.code === "LIMIT_FILE_SIZE"
          ? "A imagem deve ter no máximo 5 MB."
          : (error.message || "Falha no envio da imagem.")
      });
    }

    next();
  });
}, async (req, res, next) => {
  try {
    const imageUrl = cleanText(req.body?.image, 1500);
    const name = cleanText(req.body?.name, 90);
    const description = cleanText(req.body?.description, 500);
    const url = cleanText(req.body?.url, 5000);

    if (!name || !description || !validScriptValue(url)) {
      return res.status(400).json({
        error: "Preencha nome, descrição e o campo Entregar."
      });
    }

    if (imageUrl && !validHttpUrl(imageUrl)) {
      return res.status(400).json({
        error: "A imagem precisa ser um endereço http/https válido."
      });
    }

    let image = imageUrl || "";

    if (req.file) {
      const extension = IMAGE_TYPES[req.file.mimetype];
      const filename = `${crypto.randomUUID()}.${extension}`;

      if (IS_NETLIFY) {
        const { images } = await getBlobs();

        await images.set(filename, req.file.buffer, {
          metadata: { contentType: req.file.mimetype }
        });
      } else {
        fs.writeFileSync(path.join(UPLOAD_DIR, filename), req.file.buffer);
      }

      image = `/uploads/${filename}`;
    }

    const data = await readData();

    const embed = {
      id: crypto.randomUUID(),
      image,
      name,
      description,
      url,
      views: 0,
      published: true,
      createdAt: new Date().toISOString()
    };

    data.embeds.unshift(embed);

    await writeData(data);

    res.status(201).json(embed);
  } catch (error) {
    next(error);
  }
});

app.delete("/api/admin/embeds/:id", isAdmin, async (req, res, next) => {
  try {
    const data = await readData();
    const target = data.embeds.find(e => e.id === req.params.id);
    const before = data.embeds.length;

    data.embeds = data.embeds.filter(e => e.id !== req.params.id);

    if (data.embeds.length === before) {
      return res.status(404).json({ error: "Embed não encontrado." });
    }

    if (target?.image?.startsWith("/uploads/")) {
      const filename = path.basename(target.image);

      if (IS_NETLIFY) {
        const { images } = await getBlobs();
        await images.delete(filename);
      } else {
        const imagePath = path.join(UPLOAD_DIR, filename);

        if (fs.existsSync(imagePath)) fs.unlinkSync(imagePath);
      }
    }

    await writeData(data);

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.get("/api/admin/analytics", isAdmin, async (_req, res, next) => {
  try {
    const embeds = (await readData()).embeds;

    res.json({
      totalEmbeds: embeds.length,
      totalViews: embeds.reduce((sum, e) => sum + (Number(e.views) || 0), 0),
      embeds: embeds.map(e => ({
        id: e.id,
        name: e.name,
        views: Number(e.views) || 0
      })).sort((a, b) => b.views - a.views)
    });
  } catch (error) {
    next(error);
  }
});

if (!IS_NETLIFY) {
  app.use(express.static(path.join(__dirname, "public")));

  app.get("*", (_req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
  });
}

app.use((error, _req, res, _next) => {
  console.error("R7 SCRIPTS API error:", error);

  res.status(500).json({
    error: "Ocorreu um erro interno. Tente novamente."
  });
});

if (!IS_NETLIFY) {
  app.listen(PORT, () => {
    console.log(`R7 SCRIPTS rodando em http://localhost:${PORT}`);
  });
}

module.exports = app;
