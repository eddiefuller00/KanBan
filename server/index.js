const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const { z } = require("zod");
require("dotenv").config();

const app = express();

app.use(cors());
app.use(express.json());

const STATUSES = ["todo", "in-progress", "done"];

const taskSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "", trim: true },
    status: { type: String, enum: STATUSES, default: "todo" },
  },
  { timestamps: true }
);

const Task = mongoose.model("Task", taskSchema);

const createTaskSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  status: z.enum(STATUSES).optional(),
});

const updateTaskSchema = z
  .object({
    title: z.string().min(1).optional(),
    description: z.string().optional(),
    status: z.enum(STATUSES).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided",
  });

const toClientTask = (task) => ({
  id: task._id.toString(),
  title: task.title,
  description: task.description || "",
  status: task.status,
  createdAt: task.createdAt,
  updatedAt: task.updatedAt,
});

app.get("/tasks", async (req, res) => {
  const tasks = await Task.find().sort({ createdAt: 1 });
  res.json(tasks.map(toClientTask));
});

app.post("/tasks", async (req, res) => {
  const parsed = createTaskSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const task = await Task.create({
    title: parsed.data.title,
    description: parsed.data.description || "",
    status: parsed.data.status || "todo",
  });

  res.status(201).json(toClientTask(task));
});

app.put("/tasks/:id", async (req, res) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({ error: "Invalid task id" });
  }

  const parsed = updateTaskSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const task = await Task.findByIdAndUpdate(id, parsed.data, {
    new: true,
    runValidators: true,
  });

  if (!task) {
    return res.status(404).json({ error: "Task not found" });
  }

  res.json(toClientTask(task));
});

app.delete("/tasks/:id", async (req, res) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({ error: "Invalid task id" });
  }

  const task = await Task.findByIdAndDelete(id);
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
