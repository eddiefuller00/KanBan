import { useEffect, useMemo, useState } from "react";
import "./App.css";

type TaskStatus = "todo" | "in-progress" | "done";

type TaskActivity = {
  type: "create" | "update" | "status";
  message: string;
  at: string;
};

type Task = {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  dueDate: string | null;
  activities: TaskActivity[];
  createdAt: string;
  updatedAt: string;
};

type TaskDraft = {
  title: string;
  description: string;
  status: TaskStatus;
  dueDate: string;
};

type ThemeKey = "sunset" | "ocean" | "forest" | "nord" | "custom";

type VisibleCounts = Record<TaskStatus, number>;

const STATUSES: Array<{ key: TaskStatus; label: string; hint: string }> = [
  { key: "todo", label: "To-Do", hint: "Gather the next moves" },
  { key: "in-progress", label: "In Progress", hint: "Make it real" },
  { key: "done", label: "Done", hint: "Wrap and ship" },
];

const THEMES: Array<{ key: ThemeKey; label: string }> = [
  { key: "sunset", label: "Sunset" },
  { key: "ocean", label: "Ocean" },
  { key: "forest", label: "Forest" },
  { key: "nord", label: "Nord" },
  { key: "custom", label: "Custom" },
];

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";

const INITIAL_BATCH = 6;
const LOAD_BATCH = 4;

const emptyDraft: TaskDraft = {
  title: "",
  description: "",
  status: "todo",
  dueDate: "",
};

const statusLabels: Record<TaskStatus, string> = {
  todo: "To-Do",
  "in-progress": "In Progress",
  done: "Done",
};

const toDateInputValue = (value: string | null) => {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const formatDueDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Invalid date";
  }
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
};

const formatActivityTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

const hexToRgb = (value: string) => {
  const cleaned = value.replace("#", "");
  if (cleaned.length !== 6) {
    return null;
  }
  const number = Number.parseInt(cleaned, 16);
  if (Number.isNaN(number)) {
    return null;
  }
  return {
    r: (number >> 16) & 255,
    g: (number >> 8) & 255,
    b: number & 255,
  };
};

const mixWithWhite = (hex: string, amount: number) => {
  const rgb = hexToRgb(hex);
  if (!rgb) {
    return hex;
  }
  const mix = (value: number) => Math.round(value + (255 - value) * amount);
  return `rgb(${mix(rgb.r)}, ${mix(rgb.g)}, ${mix(rgb.b)})`;
};

const toRgba = (hex: string, alpha: number) => {
  const rgb = hexToRgb(hex);
  if (!rgb) {
    return `rgba(0, 0, 0, ${alpha})`;
  }
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
};

const getContrastingInk = (hex: string) => {
  const rgb = hexToRgb(hex);
  if (!rgb) {
    return "#1f120a";
  }
  const luminance = (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
  return luminance > 0.7 ? "#1f120a" : "#fef6ef";
};

const toTaskDraft = (task: Task): TaskDraft => ({
  title: task.title,
  description: task.description || "",
  status: task.status,
  dueDate: toDateInputValue(task.dueDate),
});

const BoardColumn = ({
  status,
  title,
  hint,
  tasks,
  isDragOver,
  draggingId,
  totalCount,
  hasMore,
  onDropTask,
  onDragOverStatus,
  onDragStart,
  onDragEnd,
  onLoadMore,
  onEdit,
  onCancelEdit,
  onChangeDraft,
  onSaveDraft,
  onOpenDelete,
  editingId,
  editingDraft,
}: {
  status: TaskStatus;
  title: string;
  hint: string;
  tasks: Task[];
  isDragOver: boolean;
  draggingId: string | null;
  totalCount: number;
  hasMore: boolean;
  onDropTask: (id: string, status: TaskStatus) => void;
  onDragOverStatus: (status: TaskStatus | null) => void;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onLoadMore: (status: TaskStatus) => void;
  onEdit: (task: Task) => void;
  onCancelEdit: () => void;
  onChangeDraft: (draft: TaskDraft) => void;
  onSaveDraft: (id: string) => void;
  onOpenDelete: (task: Task) => void;
  editingId: string | null;
  editingDraft: TaskDraft;
}) => {
  return (
    <section
      className={`column${isDragOver ? " column--dragover" : ""}`}
      onDragOver={(event) => {
        event.preventDefault();
        onDragOverStatus(status);
      }}
      onDragLeave={(event) => {
        if (event.currentTarget === event.target) {
          onDragOverStatus(null);
        }
      }}
      onDrop={(event) => {
        event.preventDefault();
        const id = event.dataTransfer.getData("text/plain");
        if (id) {
          onDropTask(id, status);
        }
        onDragOverStatus(null);
        onDragEnd();
      }}
    >
      <header className="column__header">
        <div>
          <h2>{title}</h2>
          <p>{hint}</p>
        </div>
        <span className="column__count">{totalCount}</span>
      </header>
      <div
        className="column__stack"
        onScroll={(event) => {
          const target = event.currentTarget;
          const remaining =
            target.scrollHeight - target.scrollTop - target.clientHeight;
          if (remaining < 140 && hasMore) {
            onLoadMore(status);
          }
        }}
      >
        {tasks.map((task) => {
          const isEditing = editingId === task.id;
          return (
            <article
              key={task.id}
              className={`task${draggingId === task.id ? " task--dragging" : ""}${isEditing ? " task--editing" : ""}`}
              draggable={!isEditing}
              onDragStart={(event) => {
                if (isEditing) {
                  return;
                }
                event.dataTransfer.setData("text/plain", task.id);
                event.dataTransfer.effectAllowed = "move";
                onDragStart(task.id);
              }}
              onDragEnd={onDragEnd}
              onDoubleClick={() => {
                if (!isEditing) {
                  onEdit(task);
                }
              }}
            >
              {isEditing ? (
                <div className="task__edit">
                  <label>
                    Title
                    <input
                      value={editingDraft.title}
                      onChange={(event) =>
                        onChangeDraft({
                          ...editingDraft,
                          title: event.target.value,
                        })
                      }
                    />
                  </label>
                  <label>
                    Description
                    <textarea
                      value={editingDraft.description}
                      onChange={(event) =>
                        onChangeDraft({
                          ...editingDraft,
                          description: event.target.value,
                        })
                      }
                    />
                  </label>
                  <div className="task__edit-row">
                    <label>
                      Due date
                      <input
                        type="date"
                        value={editingDraft.dueDate}
                        onChange={(event) =>
                          onChangeDraft({
                            ...editingDraft,
                            dueDate: event.target.value,
                          })
                        }
                      />
                    </label>
                    <label>
                      Status
                      <select
                        value={editingDraft.status}
                        onChange={(event) =>
                          onChangeDraft({
                            ...editingDraft,
                            status: event.target.value as TaskStatus,
                          })
                        }
                      >
                        {STATUSES.map((statusOption) => (
                          <option key={statusOption.key} value={statusOption.key}>
                            {statusOption.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="task__edit-actions">
                    <button type="button" onClick={() => onSaveDraft(task.id)}>
                      Save
                    </button>
                    <button type="button" className="ghost" onClick={onCancelEdit}>
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => onOpenDelete(task)}
                    >
                      Options
                    </button>
                  </div>
                  <section className="activity">
                    <h3>Activity</h3>
                    {task.activities.length ? (
                      <ul>
                        {task.activities
                          .slice()
                          .reverse()
                          .map((activity, index) => (
                            <li key={`${activity.at}-${index}`}>
                              <span>{activity.message}</span>
                              <time>{formatActivityTime(activity.at)}</time>
                            </li>
                          ))}
                      </ul>
                    ) : (
                      <p className="activity__empty">No activity yet.</p>
                    )}
                  </section>
                </div>
              ) : (
                <>
                  <div className="task__body">
                    <h3>{task.title}</h3>
                    {task.description ? <p>{task.description}</p> : null}
                  </div>
                  <div className="task__meta">
                    <div className="task__tags">
                      <span className="task__status">
                        {statusLabels[task.status]}
                      </span>
                      {task.dueDate ? (
                        <span className="task__due">
                          Due {formatDueDate(task.dueDate)}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </>
              )}
            </article>
          );
        })}
        {tasks.length === 0 ? (
          <div className="task task--empty">Drop tasks here</div>
        ) : null}
      </div>
    </section>
  );
};

const TaskModal = ({
  open,
  draft,
  isSaving,
  onClose,
  onChange,
  onSave,
}: {
  open: boolean;
  draft: TaskDraft;
  isSaving: boolean;
  onClose: () => void;
  onChange: (next: TaskDraft) => void;
  onSave: () => void;
}) => {
  if (!open) {
    return null;
  }

  return (
    <div className="modal" role="dialog" aria-modal="true">
      <div className="modal__backdrop" onClick={onClose} />
      <div className="modal__panel">
        <header>
          <h2>Create a task</h2>
          <button type="button" className="ghost" onClick={onClose}>
            Close
          </button>
        </header>
        <div className="modal__content">
          <label>
            Title
            <input
              value={draft.title}
              placeholder="What needs doing?"
              onChange={(event) =>
                onChange({ ...draft, title: event.target.value })
              }
            />
          </label>
          <label>
            Description
            <textarea
              value={draft.description}
              placeholder="Optional details"
              onChange={(event) =>
                onChange({ ...draft, description: event.target.value })
              }
            />
          </label>
          <label>
            Due date
            <input
              type="date"
              value={draft.dueDate}
              onChange={(event) =>
                onChange({ ...draft, dueDate: event.target.value })
              }
            />
          </label>
          <label>
            Status
            <select
              value={draft.status}
              onChange={(event) =>
                onChange({ ...draft, status: event.target.value as TaskStatus })
              }
            >
              {STATUSES.map((status) => (
                <option key={status.key} value={status.key}>
                  {status.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <footer>
          <button type="button" className="ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" onClick={onSave} disabled={isSaving}>
            {isSaving ? "Saving..." : "Save task"}
          </button>
        </footer>
      </div>
    </div>
  );
};

const ConfirmModal = ({
  open,
  title,
  description,
  confirmLabel,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
}) => {
  if (!open) {
    return null;
  }

  return (
    <div className="modal" role="dialog" aria-modal="true">
      <div className="modal__backdrop" onClick={onCancel} />
      <div className="modal__panel modal__panel--tight">
        <header>
          <h2>{title}</h2>
          <button type="button" className="ghost" onClick={onCancel}>
            Close
          </button>
        </header>
        <div className="modal__content">
          <p className="modal__text">{description}</p>
        </div>
        <footer>
          <button type="button" className="ghost" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="danger" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </footer>
      </div>
    </div>
  );
};

function App() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<TaskDraft>(emptyDraft);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverStatus, setDragOverStatus] = useState<TaskStatus | null>(null);
  const [visibleCounts, setVisibleCounts] = useState<VisibleCounts>(() => ({
    todo: INITIAL_BATCH,
    "in-progress": INITIAL_BATCH,
    done: INITIAL_BATCH,
  }));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState<TaskDraft>(emptyDraft);
  const [deleteTarget, setDeleteTarget] = useState<Task | null>(null);
  const [theme, setTheme] = useState<ThemeKey>(() => {
    const saved = localStorage.getItem("kanban-theme");
    if (saved && THEMES.some((item) => item.key === saved)) {
      return saved as ThemeKey;
    }
    return "sunset";
  });
  const [customColors, setCustomColors] = useState(() => {
    const saved = localStorage.getItem("kanban-custom-colors");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed?.primary && parsed?.secondary) {
          return { primary: parsed.primary, secondary: parsed.secondary };
        }
      } catch {
        return { primary: "#fcb982", secondary: "#f08b6e" };
      }
    }
    return { primary: "#fcb982", secondary: "#f08b6e" };
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("kanban-theme", theme);
  }, [theme]);

  useEffect(() => {
    if (theme !== "custom") {
      return;
    }
    const root = document.documentElement;
    const primary = customColors.primary;
    const secondary = customColors.secondary;
    root.style.setProperty("--custom-primary", primary);
    root.style.setProperty("--custom-secondary", secondary);
    root.style.setProperty("--custom-accent-ink", getContrastingInk(primary));
    root.style.setProperty("--custom-accent-glow", toRgba(primary, 0.45));
    root.style.setProperty("--custom-accent-outline", toRgba(primary, 0.6));
    root.style.setProperty("--custom-bg-1", mixWithWhite(primary, 0.7));
    root.style.setProperty("--custom-bg-2", mixWithWhite(secondary, 0.6));
    root.style.setProperty("--custom-bg-3", mixWithWhite(primary, 0.8));
    localStorage.setItem(
      "kanban-custom-colors",
      JSON.stringify({ primary, secondary })
    );
  }, [customColors, theme]);

  const groupedTasks = useMemo(() => {
    return STATUSES.reduce<Record<TaskStatus, Task[]>>((acc, status) => {
      acc[status.key] = tasks.filter((task) => task.status === status.key);
      return acc;
    }, {} as Record<TaskStatus, Task[]>);
  }, [tasks]);

  useEffect(() => {
    setVisibleCounts((prev) => {
      const next = { ...prev };
      STATUSES.forEach((status) => {
        const total = groupedTasks[status.key]?.length ?? 0;
        const current = prev[status.key] ?? INITIAL_BATCH;
        const baseline = Math.min(INITIAL_BATCH, total);
        next[status.key] = Math.min(Math.max(current, baseline), total);
      });
      return next;
    });
  }, [groupedTasks]);

  useEffect(() => {
    if (editingId && !tasks.some((task) => task.id === editingId)) {
      setEditingId(null);
      setEditingDraft(emptyDraft);
    }
  }, [editingId, tasks]);

  const loadTasks = async () => {
    try {
      setIsLoading(true);
      const response = await fetch(`${API_URL}/tasks`);
      if (!response.ok) {
        throw new Error("Failed to load tasks");
      }
      const data: Task[] = await response.json();
      setTasks(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadTasks();
  }, []);

  const openCreate = () => {
    setDraft(emptyDraft);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setDraft(emptyDraft);
  };

  const startInlineEdit = (task: Task) => {
    setEditingId(task.id);
    setEditingDraft(toTaskDraft(task));
  };

  const cancelInlineEdit = () => {
    setEditingId(null);
    setEditingDraft(emptyDraft);
  };

  const saveTask = async () => {
    if (!draft.title.trim()) {
      setError("Title is required");
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch(`${API_URL}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: draft.title.trim(),
          description: draft.description.trim(),
          status: draft.status,
          dueDate: draft.dueDate ? draft.dueDate : null,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to save task");
      }

      const savedTask: Task = await response.json();
      setTasks((prev) => [...prev, savedTask]);
      setError(null);
      closeModal();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsSaving(false);
    }
  };

  const saveInlineTask = async (id: string) => {
    if (!editingDraft.title.trim()) {
      setError("Title is required");
      return;
    }

    try {
      const response = await fetch(`${API_URL}/tasks/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editingDraft.title.trim(),
          description: editingDraft.description.trim(),
          status: editingDraft.status,
          dueDate: editingDraft.dueDate ? editingDraft.dueDate : null,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to save task");
      }

      const savedTask: Task = await response.json();
      setTasks((prev) =>
        prev.map((task) => (task.id === savedTask.id ? savedTask : task))
      );
      setError(null);
      cancelInlineEdit();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
  };

  const deleteTask = async (id: string) => {
    const previous = tasks;
    setTasks((prev) => prev.filter((task) => task.id !== id));
    try {
      const response = await fetch(`${API_URL}/tasks/${id}`, {
        method: "DELETE",
      });
      if (!response.ok && response.status !== 204) {
        throw new Error("Failed to delete task");
      }
    } catch (err) {
      setTasks(previous);
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
  };

  const moveTask = async (id: string, status: TaskStatus) => {
    const previous = tasks;
    setTasks((prev) =>
      prev.map((task) => (task.id === id ? { ...task, status } : task))
    );
    try {
      const response = await fetch(`${API_URL}/tasks/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!response.ok) {
        throw new Error("Failed to update status");
      }
      const updated: Task = await response.json();
      setTasks((prev) =>
        prev.map((task) => (task.id === updated.id ? updated : task))
      );
    } catch (err) {
      setTasks(previous);
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
  };

  const handleDragStart = (id: string) => {
    setDraggingId(id);
  };

  const handleDragEnd = () => {
    setDraggingId(null);
    setDragOverStatus(null);
  };

  const handleLoadMore = (status: TaskStatus) => {
    setVisibleCounts((prev) => {
      const total = groupedTasks[status]?.length ?? 0;
      const current = prev[status] ?? INITIAL_BATCH;
      const next = Math.min(current + LOAD_BATCH, total);
      if (next === current) {
        return prev;
      }
      return { ...prev, [status]: next };
    });
  };

  return (
    <div className={`app${draggingId ? " app--dragging" : ""}`}>
      <header className="app__header">
        <div>
          <p className="eyebrow">Kanban Task Board</p>
          <h1>Keep work visible. Move it forward.</h1>
          <p className="subhead">
            Drag tasks across your flow. Double-click a card to edit.
          </p>
        </div>
        <div className="header__actions">
          <div className="theme-controls">
            <label className="theme-picker">
              Theme
              <select
                value={theme}
                onChange={(event) => setTheme(event.target.value as ThemeKey)}
              >
                {THEMES.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            {theme === "custom" ? (
              <div className="theme-custom">
                <label>
                  Primary
                  <input
                    type="color"
                    value={customColors.primary}
                    onChange={(event) =>
                      setCustomColors({
                        ...customColors,
                        primary: event.target.value,
                      })
                    }
                  />
                </label>
                <label>
                  Secondary
                  <input
                    type="color"
                    value={customColors.secondary}
                    onChange={(event) =>
                      setCustomColors({
                        ...customColors,
                        secondary: event.target.value,
                      })
                    }
                  />
                </label>
              </div>
            ) : null}
          </div>
          <button type="button" onClick={openCreate}>
            New task
          </button>
        </div>
      </header>

      {error ? <div className="banner">{error}</div> : null}
      {isLoading ? (
        <div className="loading">Loading tasks...</div>
      ) : (
        <main className="board">
          {STATUSES.map((status) => {
            const visible = groupedTasks[status.key].slice(
              0,
              visibleCounts[status.key]
            );
            return (
              <BoardColumn
                key={status.key}
                status={status.key}
                title={status.label}
                hint={status.hint}
                tasks={visible}
                isDragOver={dragOverStatus === status.key}
                draggingId={draggingId}
                totalCount={groupedTasks[status.key].length}
                hasMore={visible.length < groupedTasks[status.key].length}
                onDropTask={moveTask}
                onDragOverStatus={setDragOverStatus}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                onLoadMore={handleLoadMore}
                onEdit={startInlineEdit}
                onCancelEdit={cancelInlineEdit}
                onChangeDraft={setEditingDraft}
                onSaveDraft={saveInlineTask}
                onOpenDelete={(task) => setDeleteTarget(task)}
                editingId={editingId}
                editingDraft={editingDraft}
              />
            );
          })}
        </main>
      )}

      <TaskModal
        open={isModalOpen}
        draft={draft}
        isSaving={isSaving}
        onClose={closeModal}
        onChange={setDraft}
        onSave={saveTask}
      />

      <ConfirmModal
        open={Boolean(deleteTarget)}
        title={deleteTarget ? `Delete "${deleteTarget.title}"?` : "Delete task"}
        description="This will permanently remove the task and its activity history."
        confirmLabel="Delete task"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (!deleteTarget) {
            return;
          }
          deleteTask(deleteTarget.id);
          if (editingId === deleteTarget.id) {
            cancelInlineEdit();
          }
          setDeleteTarget(null);
        }}
      />
    </div>
  );
}

export default App;
