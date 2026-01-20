const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const cookieParser = require("cookie-parser");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const { z } = require("zod");
require("dotenv").config();

const app = express();

const CLIENT_ORIGIN =
  process.env.CLIENT_ORIGIN || "http://localhost:5173";
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const TOKEN_NAME = "kanban_token";

app.use(
  cors({
    origin: CLIENT_ORIGIN,
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, trim: true },
    passwordHash: { type: String, required: true },
  },
  { timestamps: true }
);

const columnSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: "User" },
    key: { type: String, required: true, trim: true },
    label: { type: String, required: true, trim: true },
  },
  { timestamps: true }
);

columnSchema.index({ userId: 1, key: 1 }, { unique: true });

const taskSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: "User" },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "", trim: true },
    status: { type: String, required: true },
    dueDate: { type: Date, default: null },
    priority: {
      type: String,
      enum: ["low", "medium", "high", "urgent"],
      default: "medium",
    },
    activities: {
      type: [
        {
          type: {
            type: String,
            enum: ["create", "update", "status"],
            required: true,
          },
          message: { type: String, required: true },
          at: { type: Date, required: true },
        },
      ],
      default: [],
    },
  },
  { timestamps: true }
);

const User = mongoose.model("User", userSchema);
const Column = mongoose.model("Column", columnSchema);
const Task = mongoose.model("Task", taskSchema);

const dueDateSchema = z.preprocess(
  (value) => {
    if (value === "" || value === null) {
      return null;
    }
    return value;
  },
  z
    .union([
      z
        .string()
        .refine((value) => !Number.isNaN(Date.parse(value)), {
          message: "Invalid due date",
        }),
      z.null(),
    ])
    .optional()
);

const authSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

const createTaskSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  status: z.string().min(1).optional(),
  dueDate: dueDateSchema,
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
});

const updateTaskSchema = z
  .object({
    title: z.string().min(1).optional(),
    description: z.string().optional(),
    status: z.string().min(1).optional(),
    dueDate: dueDateSchema,
    priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided",
  });

const createColumnSchema = z.object({
  label: z.string().min(1),
});

const updateColumnSchema = z.object({
  label: z.string().min(1),
});

const toClientTask = (task) => ({
  id: task._id.toString(),
  title: task.title,
  description: task.description || "",
  status: task.status,
  dueDate: task.dueDate ? task.dueDate.toISOString() : null,
  priority: task.priority || "medium",
  activities: (task.activities || []).map((activity) => ({
    type: activity.type,
    message: activity.message,
    at: activity.at.toISOString(),
  })),
  createdAt: task.createdAt,
  updatedAt: task.updatedAt,
});

const toClientColumn = (column) => ({
  key: column.key,
  label: column.label,
});

const formatActivityDate = (date) => date.toISOString().slice(0, 10);

const resolveStatusKey = (columns, status) => {
  if (!columns.length) {
    return null;
  }
  const desired = status || columns[0].key;
  const direct = columns.find((column) => column.key === desired);
  if (direct) {
    return direct.key;
  }
  const normalize = (value) =>
    String(value)
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)+/g, "");
  const lowered = String(desired).toLowerCase();
  const normalized = normalize(desired);
  const normalizedCompact = normalized.replace(/-/g, "");
  const byLabel = columns.find((column) => {
    const labelLower = column.label.toLowerCase();
    const labelNormalized = normalize(column.label);
    const labelCompact = labelNormalized.replace(/-/g, "");
    return (
      labelLower === lowered ||
      labelNormalized === normalized ||
      labelCompact === normalizedCompact
    );
  });
  return byLabel ? byLabel.key : null;
};

const slugify = (label) =>
  label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "")
    .slice(0, 40) || "column";

const ensureUniqueKey = async (baseKey, userId) => {
  let key = baseKey;
  let suffix = 2;
  while (await Column.exists({ userId, key })) {
    key = `${baseKey}-${suffix}`;
    suffix += 1;
  }
  return key;
};

const getColumns = async (userId) =>
  Column.find({ userId }).sort({ createdAt: 1 });

const getColumnMap = async (userId) => {
  const columns = await getColumns(userId);
  const map = new Map();
  columns.forEach((column) => {
    map.set(column.key, column.label);
  });
  return { columns, map };
};

const createToken = (user) =>
  jwt.sign({ sub: user._id.toString() }, JWT_SECRET, { expiresIn: "7d" });

const setAuthCookie = (res, token) => {
  res.cookie(TOKEN_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
};

const clearAuthCookie = (res) => {
  res.clearCookie(TOKEN_NAME, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
};

const authRequired = async (req, res, next) => {
  const token = req.cookies[TOKEN_NAME];
  if (!token) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = { id: payload.sub };
    next();
  } catch (err) {
    return res.status(401).json({ error: "Unauthorized" });
  }
};

app.post("/auth/register", async (req, res) => {
  try {
    const parsed = authSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    const existing = await User.findOne({ email: parsed.data.email });
    if (existing) {
      return res.status(409).json({ error: "Email already in use" });
    }

    const passwordHash = await bcrypt.hash(parsed.data.password, 10);
    const user = await User.create({
      email: parsed.data.email,
      passwordHash,
    });

      const token = createToken(user);
    setAuthCookie(res, token);
    res.status(201).json({ id: user._id.toString(), email: user.email });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ error: "Email already in use" });
    }
    console.error("Register error:", error);
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/auth/login", async (req, res) => {
  try {
    const parsed = authSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    const user = await User.findOne({ email: parsed.data.email });
    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const matches = await bcrypt.compare(
      parsed.data.password,
      user.passwordHash
    );
    if (!matches) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = createToken(user);
    setAuthCookie(res, token);
    res.json({ id: user._id.toString(), email: user.email });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/auth/logout", (req, res) => {
  clearAuthCookie(res);
  res.status(204).send();
});

app.get("/auth/me", authRequired, async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }
  res.json({ id: user._id.toString(), email: user.email });
});

app.post("/ai/summary", authRequired, async (req, res) => {
  if (!OPENAI_API_KEY) {
    return res.status(500).json({ error: "OpenAI key not configured" });
  }

  try {
    const tasks = await Task.find({ userId: req.user.id }).sort({ createdAt: 1 });
    const columns = await getColumns(req.user.id);
    const summaryInput = {
      columns: columns.map((column) => ({ key: column.key, label: column.label })),
      tasks: tasks.map((task) => ({
        title: task.title,
        description: task.description || "",
        status: task.status,
        dueDate: task.dueDate ? task.dueDate.toISOString().slice(0, 10) : null,
        priority: task.priority || "medium",
      })),
    };

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "You summarize a kanban board. Return concise bullet points: 1) a 1-2 sentence overview, 2) a prioritized top-5 task list based on priority and due date, 3) risks or overdue items. Keep it brief.",
          },
          {
            role: "user",
            content: JSON.stringify(summaryInput),
          },
        ],
        temperature: 0.4,
        max_tokens: 350,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return res.status(502).json({ error: errorText || "AI request failed" });
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) {
      return res.status(502).json({ error: "AI response empty" });
    }

    res.json({ summary: content.trim() });
  } catch (error) {
    console.error("AI summary error:", error);
    res.status(500).json({ error: "Server error" });
  }
});

app.get("/columns", authRequired, async (req, res) => {
  const columns = await getColumns(req.user.id);
  res.json(columns.map(toClientColumn));
});

app.post("/columns", authRequired, async (req, res) => {
  const parsed = createColumnSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const baseKey = slugify(parsed.data.label);
  const key = await ensureUniqueKey(baseKey, req.user.id);
  const column = await Column.create({
    key,
    label: parsed.data.label.trim(),
    userId: req.user.id,
  });
  res.status(201).json(toClientColumn(column));
});

app.put("/columns/:key", authRequired, async (req, res) => {
  const { key } = req.params;
  const parsed = updateColumnSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const columns = await getColumns(req.user.id);
  const column = columns.find((item) =>
    item.key === key || item.label.toLowerCase() === key.toLowerCase()
  );
  if (!column) {
    return res.status(404).json({ error: "Column not found" });
  }

  column.label = parsed.data.label.trim();
  await column.save();
  res.json(toClientColumn(column));
});

app.delete("/columns/:key", authRequired, async (req, res) => {
  const { key } = req.params;
  const { migrateTo } = req.query;
  const columns = await getColumns(req.user.id);
  if (columns.length <= 1) {
    return res.status(400).json({ error: "At least one column is required" });
  }

  const column = columns.find((item) =>
    item.key === key || item.label.toLowerCase() === key.toLowerCase()
  );
  if (!column) {
    return res.status(404).json({ error: "Column not found" });
  }

  const fallback = columns.find((item) => item.key !== column.key);
  const migrateKey =
    typeof migrateTo === "string" && migrateTo
      ? migrateTo
      : fallback?.key;

  if (!migrateKey || migrateKey === column.key) {
    return res.status(400).json({ error: "Invalid migration target" });
  }

  const migrateExists = columns.some((item) => item.key === migrateKey);
  if (!migrateExists) {
    return res.status(400).json({ error: "Invalid migration target" });
  }

  await Task.updateMany(
    { userId: req.user.id, status: column.key },
    { $set: { status: migrateKey } }
  );
  await Column.deleteOne({ userId: req.user.id, key: column.key });

  res.status(204).send();
});

app.get("/tasks", authRequired, async (req, res) => {
  const tasks = await Task.find({ userId: req.user.id }).sort({ createdAt: 1 });
  res.json(tasks.map(toClientTask));
});

app.post("/tasks", authRequired, async (req, res) => {
  const parsed = createTaskSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const { columns, map } = await getColumnMap(req.user.id);
  if (columns.length === 0) {
    return res.status(400).json({ error: "No columns yet" });
  }
  const statusKey = resolveStatusKey(columns, parsed.data.status || undefined);
  if (!statusKey || !map.has(statusKey)) {
    return res.status(400).json({ error: "Invalid column" });
  }

  const task = await Task.create({
    userId: req.user.id,
    title: parsed.data.title,
    description: parsed.data.description || "",
    status: statusKey,
    dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : null,
    priority: parsed.data.priority || "medium",
    activities: [
      {
        type: "create",
        message: "Task created",
        at: new Date(),
      },
    ],
  });

  res.status(201).json(toClientTask(task));
});

app.put("/tasks/:id", authRequired, async (req, res) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({ error: "Invalid task id" });
  }

  const parsed = updateTaskSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const task = await Task.findOne({ _id: id, userId: req.user.id });
  if (!task) {
    return res.status(404).json({ error: "Task not found" });
  }

  let hasChanges = false;

  if ("title" in parsed.data && parsed.data.title !== task.title) {
    task.title = parsed.data.title;
    task.activities.push({
      type: "update",
      message: "Title updated",
      at: new Date(),
    });
    hasChanges = true;
  }

  if (
    "description" in parsed.data &&
    parsed.data.description !== task.description
  ) {
    task.description = parsed.data.description || "";
    task.activities.push({
      type: "update",
      message: "Description updated",
      at: new Date(),
    });
    hasChanges = true;
  }

  if ("status" in parsed.data && parsed.data.status !== task.status) {
    const { columns, map } = await getColumnMap(req.user.id);
    const resolvedStatus = resolveStatusKey(columns, parsed.data.status);
    if (!resolvedStatus || !map.has(resolvedStatus)) {
      return res.status(400).json({ error: "Invalid column" });
    }
    task.status = resolvedStatus;
    task.activities.push({
      type: "status",
      message: `Moved to ${map.get(task.status)}`,
      at: new Date(),
    });
    hasChanges = true;
  }

  if ("priority" in parsed.data && parsed.data.priority !== task.priority) {
    task.priority = parsed.data.priority;
    task.activities.push({
      type: "update",
      message: `Priority set to ${task.priority}`,
      at: new Date(),
    });
    hasChanges = true;
  }

  if ("dueDate" in parsed.data) {
    const nextDueDate = parsed.data.dueDate
      ? new Date(parsed.data.dueDate)
      : null;
    const currentTime = task.dueDate ? task.dueDate.getTime() : null;
    const nextTime = nextDueDate ? nextDueDate.getTime() : null;
    if (currentTime !== nextTime) {
      task.dueDate = nextDueDate;
      task.activities.push({
        type: "update",
        message: nextDueDate
          ? `Due date set to ${formatActivityDate(nextDueDate)}`
          : "Due date cleared",
        at: new Date(),
      });
      hasChanges = true;
    }
  }

  if (hasChanges) {
    await task.save();
  }

  res.json(toClientTask(task));
});

app.delete("/tasks/:id", authRequired, async (req, res) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({ error: "Invalid task id" });
  }

  const task = await Task.findOneAndDelete({ _id: id, userId: req.user.id });
  if (!task) {
    return res.status(404).json({ error: "Task not found" });
  }

  res.status(204).send();
});

const port = Number(process.env.PORT) || 4000;
const mongoUrl = process.env.MONGO_URL || "mongodb://127.0.0.1:27017/kanban";

mongoose
  .connect(mongoUrl)
  .then(() => {
    app.listen(port, () => {
      console.log(`API running on http://localhost:${port}`);
    });
  })
  .catch((error) => {
    console.error("Mongo connection error:", error.message);
    process.exit(1);
  });
