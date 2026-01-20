import { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";

type ColumnKey = string;

type Column = {
  key: string;
  label: string;
  hint?: string;
};

type TaskActivity = {
  type: "create" | "update" | "status";
  message: string;
  at: string;
};

type Task = {
  id: string;
  title: string;
  description: string;
  status: ColumnKey;
  dueDate: string | null;
  priority: "low" | "medium" | "high" | "urgent";
  activities: TaskActivity[];
  createdAt: string;
  updatedAt: string;
};

type TaskDraft = {
  title: string;
  description: string;
  status: ColumnKey;
  dueDate: string;
  priority: "low" | "medium" | "high" | "urgent";
};

type User = {
  id: string;
  email: string;
};

type ThemeKey = "sunset" | "ocean" | "forest" | "nord" | "custom";

type BoardStyle = "cozy" | "compact" | "focus";

type VisibleCounts = Record<ColumnKey, number>;

const DEFAULT_COLUMNS: Column[] = [];

const COLUMN_HINTS: Record<string, string> = {
  todo: "Gather the next moves",
  "in-progress": "Make it real",
  done: "Wrap and ship",
};

const THEMES: Array<{ key: ThemeKey; label: string }> = [
  { key: "sunset", label: "Sunset" },
  { key: "ocean", label: "Ocean" },
  { key: "forest", label: "Forest" },
  { key: "nord", label: "Nord" },
  { key: "custom", label: "Custom" },
];

const BOARD_STYLES: Array<{ key: BoardStyle; label: string }> = [
  { key: "cozy", label: "Cozy" },
  { key: "compact", label: "Compact" },
  { key: "focus", label: "Focus" },
];

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";

const fetchWithCredentials = (input: RequestInfo | URL, init?: RequestInit) =>
  fetch(input, {
    ...init,
    credentials: "include",
  });

const INITIAL_BATCH = 6;
const LOAD_BATCH = 4;

const emptyDraft: TaskDraft = {
  title: "",
  description: "",
  status: "todo",
  dueDate: "",
  priority: "medium",
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

const useAnimatedCount = (value: number) => {
  const previous = useRef(value);
  const [display, setDisplay] = useState(value);

  useEffect(() => {
    const start = previous.current;
    const end = value;
    previous.current = value;
    if (start === end) {
      return;
    }
    const duration = 320;
    let frame = 0;
    const startTime = performance.now();
    const step = (now: number) => {
      const progress = Math.min(1, (now - startTime) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(start + (end - start) * eased));
      if (progress < 1) {
        frame = requestAnimationFrame(step);
      }
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value]);

  return display;
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

const applyColumnHints = (columns: Column[]) =>
  columns.map((column) => ({
    ...column,
    hint: COLUMN_HINTS[column.key] || column.hint,
  }));

const toTaskDraft = (task: Task): TaskDraft => ({
  title: task.title,
  description: task.description || "",
  status: task.status,
  dueDate: toDateInputValue(task.dueDate),
  priority: task.priority || "medium",
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
  columns,
  columnLabels,
  onOpenColumnSettings,
  canMoveLeft,
  canMoveRight,
  onMoveLeft,
  onMoveRight,
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
  status: ColumnKey;
  title: string;
  hint?: string;
  tasks: Task[];
  isDragOver: boolean;
  draggingId: string | null;
  totalCount: number;
  hasMore: boolean;
  columns: Column[];
  columnLabels: Record<string, string>;
  onOpenColumnSettings: () => void;
  canMoveLeft: boolean;
  canMoveRight: boolean;
  onMoveLeft: () => void;
  onMoveRight: () => void;
  onDropTask: (id: string, status: ColumnKey) => void;
  onDragOverStatus: (status: ColumnKey | null) => void;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onLoadMore: (status: ColumnKey) => void;
  onEdit: (task: Task) => void;
  onCancelEdit: () => void;
  onChangeDraft: (draft: TaskDraft) => void;
  onSaveDraft: (id: string) => void;
  onOpenDelete: (task: Task) => void;
  editingId: string | null;
  editingDraft: TaskDraft;
}) => {
  const animatedCount = useAnimatedCount(totalCount);
  const [isBumping, setIsBumping] = useState(false);

  useEffect(() => {
    setIsBumping(true);
    const timer = window.setTimeout(() => setIsBumping(false), 220);
    return () => window.clearTimeout(timer);
  }, [totalCount]);

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
          {hint ? <p>{hint}</p> : null}
        </div>
        <div className="column__meta">
          <div className="column__nav">
            <button
              type="button"
              onClick={onMoveLeft}
              disabled={!canMoveLeft}
              aria-label={`Move ${title} column left`}
            >
              ←
            </button>
            <button
              type="button"
              onClick={onMoveRight}
              disabled={!canMoveRight}
              aria-label={`Move ${title} column right`}
            >
              →
            </button>
          </div>
          <span
            className={`column__count${isBumping ? " column__count--bump" : ""}`}
          >
            {animatedCount}
          </span>
          <button
            type="button"
            className="column__action"
            onClick={onOpenColumnSettings}
            aria-label={`Edit ${title} column`}
          >
            •••
          </button>
        </div>
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
                            status: event.target.value as ColumnKey,
                          })
                        }
                      >
                        {columns.map((statusOption) => (
                          <option key={statusOption.key} value={statusOption.key}>
                            {statusOption.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <label>
                    Priority
                    <select
                      value={editingDraft.priority}
                      onChange={(event) =>
                        onChangeDraft({
                          ...editingDraft,
                          priority: event.target.value as TaskDraft["priority"],
                        })
                      }
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                      <option value="urgent">Urgent</option>
                    </select>
                  </label>
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
                        {columnLabels[task.status] || task.status}
                      </span>
                      <span className={`task__priority task__priority--${task.priority}`}>
                        {task.priority}
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

const AuthScreen = ({
  mode,
  form,
  isLoading,
  error,
  onFormChange,
  onSubmit,
  onToggle,
}: {
  mode: "login" | "register";
  form: { email: string; password: string };
  isLoading: boolean;
  error: string | null;
  onFormChange: (next: { email: string; password: string }) => void;
  onSubmit: () => void;
  onToggle: () => void;
}) => {
  return (
    <div className="auth">
      <div className="auth__card">
        <header>
          <h1>{mode === "login" ? "Welcome back" : "Create account"}</h1>
          <p>
            {mode === "login"
              ? "Sign in to keep your board in sync."
              : "Create your account to save and organize tasks."}
          </p>
        </header>
        {error ? <div className="banner">{error}</div> : null}
        <label>
          Email
          <input
            type="email"
            value={form.email}
            placeholder="you@example.com"
            onChange={(event) =>
              onFormChange({ ...form, email: event.target.value })
            }
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={form.password}
            placeholder="At least 6 characters"
            onChange={(event) =>
              onFormChange({ ...form, password: event.target.value })
            }
          />
        </label>
        <button type="button" onClick={onSubmit} disabled={isLoading}>
          {isLoading
            ? "Please wait..."
            : mode === "login"
            ? "Sign in"
            : "Sign up"}
        </button>
        <button type="button" className="ghost" onClick={onToggle}>
          {mode === "login"
            ? "Need an account? Sign up"
            : "Already have an account? Sign in"}
        </button>
      </div>
    </div>
  );
};

const OnboardingScreen = ({
  values,
  error,
  isLoading,
  onChange,
  onSubmit,
}: {
  values: string[];
  error: string | null;
  isLoading: boolean;
  onChange: (next: string[]) => void;
  onSubmit: () => void;
}) => {
  return (
    <div className="auth onboarding">
      <div className="auth__card onboarding__card">
        <header>
          <h1>Set up your board</h1>
          <p>Create at least three columns to get started.</p>
        </header>
        {error ? <div className="banner">{error}</div> : null}
        <div className="onboarding__fields">
          {values.map((value, index) => (
            <label key={`column-${index}`}>
              Column {index + 1}
              <input
                type="text"
                value={value}
                placeholder={
                  index === 0
                    ? "To-Do"
                    : index === 1
                    ? "In Progress"
                    : "Done"
                }
                onChange={(event) => {
                  const next = [...values];
                  next[index] = event.target.value;
                  onChange(next);
                }}
              />
            </label>
          ))}
        </div>
        <button type="button" onClick={onSubmit} disabled={isLoading}>
          {isLoading ? "Creating..." : "Create columns"}
        </button>
      </div>
    </div>
  );
};

const TaskModal = ({
  open,
  draft,
  isSaving,
  columns,
  onClose,
  onChange,
  onSave,
}: {
  open: boolean;
  draft: TaskDraft;
  isSaving: boolean;
  columns: Column[];
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
                onChange({ ...draft, status: event.target.value as ColumnKey })
              }
            >
              {columns.map((status) => (
                <option key={status.key} value={status.key}>
                  {status.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Priority
            <select
              value={draft.priority}
              onChange={(event) =>
                onChange({
                  ...draft,
                  priority: event.target.value as TaskDraft["priority"],
                })
              }
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
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

const ColumnModal = ({
  open,
  column,
  label,
  migrateTo,
  columns,
  onClose,
  onLabelChange,
  onMigrateChange,
  onRename,
  onDelete,
}: {
  open: boolean;
  column: Column | null;
  label: string;
  migrateTo: string;
  columns: Column[];
  onClose: () => void;
  onLabelChange: (value: string) => void;
  onMigrateChange: (value: string) => void;
  onRename: () => void;
  onDelete: () => void;
}) => {
  if (!open || !column) {
    return null;
  }

  const availableTargets = columns.filter((item) => item.key !== column.key);

  return (
    <div className="modal" role="dialog" aria-modal="true">
      <div className="modal__backdrop" onClick={onClose} />
      <div className="modal__panel modal__panel--settings">
        <header>
          <h2>Edit column</h2>
          <button type="button" className="ghost" onClick={onClose}>
            Close
          </button>
        </header>
        <div className="modal__content">
          <label>
            Column name
            <input
              value={label}
              onChange={(event) => onLabelChange(event.target.value)}
            />
          </label>
          <button type="button" onClick={onRename}>
            Save name
          </button>
          <div className="action-menu__section">
            <span className="action-menu__title">Delete column</span>
            {availableTargets.length ? (
              <>
                <label>
                  Move tasks to
                  <select
                    value={migrateTo}
                    onChange={(event) => onMigrateChange(event.target.value)}
                  >
                    {availableTargets.map((item) => (
                      <option key={item.key} value={item.key}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </label>
                <button type="button" className="danger" onClick={onDelete}>
                  Delete column
                </button>
              </>
            ) : (
              <p className="activity__empty">
                Add another column before deleting this one.
              </p>
            )}
          </div>
        </div>
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
  const [user, setUser] = useState<User | null>(null);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [authForm, setAuthForm] = useState({ email: "", password: "" });
  const [authError, setAuthError] = useState<string | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [onboardingValues, setOnboardingValues] = useState<string[]>([
    "",
    "",
    "",
  ]);
  const [isAiOpen, setIsAiOpen] = useState(false);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [onboardingError, setOnboardingError] = useState<string | null>(null);
  const [isOnboardingLoading, setIsOnboardingLoading] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<TaskDraft>(emptyDraft);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverStatus, setDragOverStatus] = useState<ColumnKey | null>(null);
  const [visibleCounts, setVisibleCounts] = useState<VisibleCounts>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState<TaskDraft>(emptyDraft);
  const [deleteTarget, setDeleteTarget] = useState<Task | null>(null);
  const [columns, setColumns] = useState<Column[]>(DEFAULT_COLUMNS);
  const [newColumnLabel, setNewColumnLabel] = useState("");
  const [columnModal, setColumnModal] = useState<Column | null>(null);
  const [columnLabelDraft, setColumnLabelDraft] = useState("");
  const [columnMigrateTo, setColumnMigrateTo] = useState("");
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [boardStyle, setBoardStyle] = useState<BoardStyle>(() => {
    const saved = localStorage.getItem("kanban-board-style");
    if (saved && BOARD_STYLES.some((item) => item.key === saved)) {
      return saved as BoardStyle;
    }
    return "cozy";
  });
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
    document.documentElement.dataset.boardStyle = boardStyle;
    localStorage.setItem("kanban-board-style", boardStyle);
  }, [boardStyle]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("kanban-theme", theme);
  }, [theme]);

  useEffect(() => {
    if (!isMenuOpen) {
      return;
    }
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsMenuOpen(false);
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("keydown", handleKey);
    };
  }, [isMenuOpen]);



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
    const grouped: Record<string, Task[]> = {};
    columns.forEach((column) => {
      grouped[column.key] = [];
    });
    tasks.forEach((task) => {
      if (!grouped[task.status]) {
        grouped[task.status] = [];
      }
      grouped[task.status].push(task);
    });
    return grouped;
  }, [tasks, columns]);

  const columnLabels = useMemo(() => {
    return columns.reduce<Record<string, string>>((acc, column) => {
      acc[column.key] = column.label;
      return acc;
    }, {} as Record<string, string>);
  }, [columns]);

  useEffect(() => {
    setVisibleCounts((prev) => {
      const next: Record<string, number> = { ...prev };
      columns.forEach((column) => {
        const total = groupedTasks[column.key]?.length ?? 0;
        const current = prev[column.key] ?? INITIAL_BATCH;
        const baseline = Math.min(INITIAL_BATCH, total);
        next[column.key] = Math.min(Math.max(current, baseline), total);
      });
      return next;
    });
  }, [groupedTasks, columns]);

  useEffect(() => {
    if (editingId && !tasks.some((task) => task.id === editingId)) {
      setEditingId(null);
      setEditingDraft(emptyDraft);
    }
  }, [editingId, tasks]);

  useEffect(() => {
    if (!columns.length) {
      return;
    }
    const fallback = columns[0].key;
    setDraft((prev) =>
      columns.some((column) => column.key === prev.status)
        ? prev
        : { ...prev, status: fallback }
    );
    setEditingDraft((prev) =>
      columns.some((column) => column.key === prev.status)
        ? prev
        : { ...prev, status: fallback }
    );
  }, [columns]);

  const loadSession = async () => {
    try {
      const response = await fetchWithCredentials(`${API_URL}/auth/me`);
      if (!response.ok) {
        setUser(null);
        setIsLoading(false);
        return;
      }
      const data: User = await response.json();
      setUser(data);
    } catch (err) {
      setUser(null);
      setIsLoading(false);
    }
  };

  const loadBoard = async () => {
    try {
      setIsLoading(true);
      const [columnsResponse, tasksResponse] = await Promise.all([
        fetchWithCredentials(`${API_URL}/columns`),
        fetchWithCredentials(`${API_URL}/tasks`),
      ]);
      if (columnsResponse.status === 401 || tasksResponse.status === 401) {
        setUser(null);
        return;
      }
      if (!columnsResponse.ok) {
        throw new Error("Failed to load columns");
      }
      if (!tasksResponse.ok) {
        throw new Error("Failed to load tasks");
      }
      const columnsData: Column[] = applyColumnHints(
        await columnsResponse.json()
      );
      const tasksData: Task[] = await tasksResponse.json();
      setColumns(columnsData);
      setTasks(tasksData);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadSession();
  }, []);

  useEffect(() => {
    if (!user) {
      return;
    }
    loadBoard();
  }, [user]);

  const submitAuth = async () => {
    setIsAuthLoading(true);
    try {
      const response = await fetchWithCredentials(
        `${API_URL}/auth/${authMode === "login" ? "login" : "register"}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: authForm.email.trim(),
            password: authForm.password,
          }),
        }
      );
      if (!response.ok) {
        let message = "Authentication failed";
        const contentType = response.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
          const payload = await response.json();
          if (payload && typeof payload.error === "string") {
            message = payload.error;
          }
        } else {
          const payload = await response.text();
          if (payload) {
            message = payload;
          }
        }
        throw new Error(message);
      }
      const data: User = await response.json();
      setUser(data);
      setAuthError(null);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsAuthLoading(false);
    }
  };

  const logout = async () => {
    await fetchWithCredentials(`${API_URL}/auth/logout`, { method: "POST" });
    setUser(null);
    setTasks([]);
  };

  const submitOnboarding = async () => {
    const labels = onboardingValues
      .map((value) => value.trim())
      .filter(Boolean);
    if (labels.length < 3) {
      setOnboardingError("Add at least three column names.");
      return;
    }

    setIsOnboardingLoading(true);
    try {
      for (const label of labels) {
        const response = await fetchWithCredentials(`${API_URL}/columns`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ label }),
        });
        if (!response.ok) {
          let message = "Failed to create columns";
          const contentType = response.headers.get("content-type") || "";
          if (contentType.includes("application/json")) {
            const payload = await response.json();
            if (payload && typeof payload.error === "string") {
              message = payload.error;
            }
          } else {
            const payload = await response.text();
            if (payload) {
              message = payload;
            }
          }
          throw new Error(message);
        }
      }
      setOnboardingError(null);
      await loadBoard();
    } catch (err) {
      setOnboardingError(
        err instanceof Error ? err.message : "Something went wrong"
      );
    } finally {
      setIsOnboardingLoading(false);
    }
  };

  const requestAiSummary = async () => {
    setIsAiOpen(true);
    setIsAiLoading(true);
    setAiError(null);
    setAiSummary(null);
    try {
      const response = await fetchWithCredentials(`${API_URL}/ai/summary`, {
        method: "POST",
      });
      if (!response.ok) {
        let message = "Failed to fetch AI summary";
        const contentType = response.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
          const payload = await response.json();
          if (payload && typeof payload.error === "string") {
            message = payload.error;
          }
        } else {
          const payload = await response.text();
          if (payload) {
            message = payload;
          }
        }
        throw new Error(message);
      }
      const data = await response.json();
      setAiSummary(data.summary || "No summary returned.");
    } catch (err) {
      setAiError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsAiLoading(false);
    }
  };

  const openCreate = () => {
    const defaultStatus = columns[0]?.key || "todo";
    setDraft({ ...emptyDraft, status: defaultStatus });
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
      const status = columns.some((column) => column.key === draft.status)
        ? draft.status
        : columns[0]?.key;
      const response = await fetchWithCredentials(`${API_URL}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: draft.title.trim(),
          description: draft.description.trim(),
          status,
          dueDate: draft.dueDate ? draft.dueDate : null,
          priority: draft.priority,
        }),
      });

      if (!response.ok) {
        let message = "Failed to save task";
        const contentType = response.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
          const payload = await response.json();
          if (payload && typeof payload.error === "string") {
            message = payload.error;
          }
        } else {
          const payload = await response.text();
          if (payload) {
            message = payload;
          }
        }
        throw new Error(message);
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

  const openColumnModal = (column: Column) => {
    const fallback = columns.find((item) => item.key !== column.key);
    setColumnModal(column);
    setColumnLabelDraft(column.label);
    setColumnMigrateTo(fallback?.key || "");
  };

  const renameColumn = async () => {
    if (!columnModal) {
      return;
    }
    const label = columnLabelDraft.trim();
    if (!label) {
      return;
    }
    try {
      const response = await fetchWithCredentials(`${API_URL}/columns/${encodeURIComponent(columnModal.key)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label }),
      });
      if (!response.ok) {
        throw new Error("Failed to rename column");
      }
      const updated: Column = await response.json();
      setColumns((prev) =>
        prev.map((column) => (column.key === updated.key ? updated : column))
      );
      setColumnModal(updated);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
  };

  const deleteColumn = async () => {
    if (!columnModal || !columnMigrateTo) {
      return;
    }
    try {
      const response = await fetchWithCredentials(
        `${API_URL}/columns/${encodeURIComponent(
          columnModal.key
        )}?migrateTo=${encodeURIComponent(columnMigrateTo)}`,
        { method: "DELETE" }
      );
      if (!response.ok && response.status !== 204) {
        throw new Error("Failed to delete column");
      }
      setColumns((prev) => prev.filter((col) => col.key !== columnModal.key));
      setTasks((prev) =>
        prev.map((task) =>
          task.status === columnModal.key
            ? { ...task, status: columnMigrateTo }
            : task
        )
      );
      setColumnModal(null);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
  };

  const addColumn = async () => {
    const label = newColumnLabel.trim();
    if (!label) {
      return;
    }
    try {
      const response = await fetchWithCredentials(`${API_URL}/columns`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label }),
      });
      if (!response.ok) {
        throw new Error("Failed to add column");
      }
      const column: Column = applyColumnHints([await response.json()])[0];
      setColumns((prev) => [...prev, column]);
      setNewColumnLabel("");
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
  };

  const saveInlineTask = async (id: string) => {
    if (!editingDraft.title.trim()) {
      setError("Title is required");
      return;
    }

    try {
      const response = await fetchWithCredentials(`${API_URL}/tasks/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editingDraft.title.trim(),
          description: editingDraft.description.trim(),
          status: editingDraft.status,
          dueDate: editingDraft.dueDate ? editingDraft.dueDate : null,
          priority: editingDraft.priority,
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
      const response = await fetchWithCredentials(`${API_URL}/tasks/${id}`, {
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

  const moveTask = async (id: string, status: ColumnKey) => {
    const previous = tasks;
    setTasks((prev) =>
      prev.map((task) => (task.id === id ? { ...task, status } : task))
    );
    try {
      const response = await fetchWithCredentials(`${API_URL}/tasks/${id}`, {
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

            const moveColumn = (key: string, direction: "left" | "right") => {
    setColumns((prev) => {
      const index = prev.findIndex((col) => col.key === key);
      if (index === -1) {
        return prev;
      }
      const nextIndex = direction === "left" ? index - 1 : index + 1;
      if (nextIndex < 0 || nextIndex >= prev.length) {
        return prev;
      }
      const next = [...prev];
      const swap = next[nextIndex];
      next[nextIndex] = next[index];
      next[index] = swap;
      return next;
    });
  };

  const handleLoadMore = (status: ColumnKey) => {
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

  if (!user && !isLoading) {
    return (
      <AuthScreen
        mode={authMode}
        form={authForm}
        error={authError}
        isLoading={isAuthLoading}
        onFormChange={(next) => setAuthForm(next)}
        onSubmit={submitAuth}
        onToggle={() =>
          setAuthMode(authMode === "login" ? "register" : "login")
        }
      />
    );
  }

  if (user && !isLoading && columns.length === 0) {
    return (
      <OnboardingScreen
        values={onboardingValues}
        error={onboardingError}
        isLoading={isOnboardingLoading}
        onChange={setOnboardingValues}
        onSubmit={submitOnboarding}
      />
    );
  }

  return (
    <div className={`app${draggingId ? " app--dragging" : ""}`}>
      <header className="topbar">
        <div className="topbar__brand">
          <span className="topbar__dot" aria-hidden="true" />
          <span>Kanban</span>
        </div>
        <div className="topbar__actions">
          <button
            type="button"
            className="ghost"
            onClick={requestAiSummary}
            disabled={isAiLoading}
          >
            {isAiLoading ? "Summarizing..." : "AI summary"}
          </button>
          <button type="button" className="ghost" onClick={logout}>
            Sign out
          </button>
          <button type="button" onClick={openCreate}>
            New task
          </button>
          <div className="action-menu">
            <button
              type="button"
              className="ghost action-menu__trigger"
              aria-haspopup="dialog"
              aria-expanded={isMenuOpen}
              aria-label="Open menu"
              onClick={() => setIsMenuOpen(true)}
            >
              ...
            </button>
          </div>
        </div>
      </header>

      {isMenuOpen ? (
        <div className="modal" role="dialog" aria-modal="true">
          <div
            className="modal__backdrop"
            onClick={() => setIsMenuOpen(false)}
          />
          <div className="modal__panel modal__panel--settings">
            <header>
              <h2>Board settings</h2>
              <button
                type="button"
                className="ghost"
                onClick={() => setIsMenuOpen(false)}
              >
                Close
              </button>
            </header>
            <div className="modal__content">
              <div className="action-menu__section">
                <span className="action-menu__title">Board style</span>
                <div className="action-menu__options">
                  {BOARD_STYLES.map((style) => (
                    <button
                      key={style.key}
                      type="button"
                      className={boardStyle === style.key ? "active" : undefined}
                      onClick={() => setBoardStyle(style.key)}
                    >
                      {style.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="action-menu__section">
                <span className="action-menu__title">Columns</span>
                <div className="column-create">
                  <input
                    type="text"
                    value={newColumnLabel}
                    placeholder="New column name"
                    onChange={(event) => setNewColumnLabel(event.target.value)}
                  />
                  <button type="button" onClick={addColumn}>
                    Add
                  </button>
                </div>
              </div>
              <div className="action-menu__section">
                <span className="action-menu__title">Account</span>
                <button type="button" className="ghost" onClick={logout}>
                  Sign out
                </button>
              </div>
              <div className="action-menu__section">
                <span className="action-menu__title">AI</span>
                <button
                  type="button"
                  className="ghost"
                  onClick={requestAiSummary}
                  disabled={isAiLoading}
                >
                  {isAiLoading ? "Generating..." : "Generate board summary"}
                </button>
              </div>
              <div className="action-menu__section">
                <span className="action-menu__title">Theme</span>
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
            </div>
            <footer>
              <button
                type="button"
                className="ghost"
                onClick={() => setIsMenuOpen(false)}
              >
                Done
              </button>
            </footer>
          </div>
        </div>
      ) : null}

      {isAiOpen ? (
        <div className="modal" role="dialog" aria-modal="true">
          <div className="modal__backdrop" onClick={() => setIsAiOpen(false)} />
          <div className="modal__panel">
            <header>
              <h2>AI summary</h2>
              <button
                type="button"
                className="ghost"
                onClick={() => setIsAiOpen(false)}
              >
                Close
              </button>
            </header>
            <div className="modal__content">
              {isAiLoading ? (
                <p className="modal__text">Summarizing your board...</p>
              ) : aiError ? (
                <div className="banner">{aiError}</div>
              ) : (
                <p className="modal__text">{aiSummary}</p>
              )}
            </div>
          </div>
        </div>
      ) : null}

      <header className="app__header">
        <div>
          <p className="eyebrow">Kanban Task Board</p>
          <h1>Keep work visible. Move it forward.</h1>
          <p className="subhead">
            Drag tasks across your flow. Double-click a card to edit.
          </p>
        </div>
      </header>

      {error ? <div className="banner">{error}</div> : null}
      {isLoading ? (
        <div className="loading">Loading tasks...</div>
      ) : (
        <main className="board">
          {columns.map((column, index) => {
            const visible = (groupedTasks[column.key] || []).slice(
              0,
              visibleCounts[column.key] || INITIAL_BATCH
            );
            return (
              <BoardColumn
                key={column.key}
                status={column.key}
                title={column.label}
                hint={column.hint}
                tasks={visible}
                isDragOver={dragOverStatus === column.key}
                draggingId={draggingId}
                totalCount={(groupedTasks[column.key] || []).length}
                hasMore={visible.length < (groupedTasks[column.key] || []).length}
                columns={columns}
                columnLabels={columnLabels}
                onOpenColumnSettings={() => openColumnModal(column)}
                canMoveLeft={index > 0}
                canMoveRight={index < columns.length - 1}
                onMoveLeft={() => moveColumn(column.key, "left")}
                onMoveRight={() => moveColumn(column.key, "right")}
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

      <ColumnModal
        open={Boolean(columnModal)}
        column={columnModal}
        label={columnLabelDraft}
        migrateTo={columnMigrateTo}
        columns={columns}
        onClose={() => setColumnModal(null)}
        onLabelChange={setColumnLabelDraft}
        onMigrateChange={setColumnMigrateTo}
        onRename={renameColumn}
        onDelete={deleteColumn}
      />

      <TaskModal
        open={isModalOpen}
        draft={draft}
        isSaving={isSaving}
        columns={columns}
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
