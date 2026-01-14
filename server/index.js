const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const { z } = require("zod");
require("dotenv").config();

const app = express();

app.use(cors());
app.use(express.json());

const STATUSES = ["todo", "in-progress", "done"];
const STATUS_LABELS = {
  todo: "To-Do",
  "in-progress": "In Progress",
  done: "Done",
};

const taskSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "", trim: true },
    status: { type: String, enum: STATUSES, default: "todo" },
    dueDate: { type: Date, default: null },
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

const createTaskSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  status: z.enum(STATUSES).optional(),
  dueDate: dueDateSchema,
});

const updateTaskSchema = z
  .object({
    title: z.string().min(1).optional(),
    description: z.string().optional(),
    status: z.enum(STATUSES).optional(),
    dueDate: dueDateSchema,
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided",
  });

const toClientTask = (task) => ({
  id: task._id.toString(),
  title: task.title,
  description: task.description || "",
  status: task.status,
  dueDate: task.dueDate ? task.dueDate.toISOString() : null,
  activities: (task.activities || []).map((activity) => ({
    type: activity.type,
    message: activity.message,
    at: activity.at.toISOString(),
  })),
  createdAt: task.createdAt,
  updatedAt: task.updatedAt,
});

const formatActivityDate = (date) => date.toISOString().slice(0, 10);

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
    dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : null,
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

app.put("/tasks/:id", async (req, res) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({ error: "Invalid task id" });
  }

  const parsed = updateTaskSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const task = await Task.findById(id);
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
    task.status = parsed.data.status;
    task.activities.push({
      type: "status",
      message: `Moved to ${STATUS_LABELS[task.status]}`,
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
