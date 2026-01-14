import { useEffect, useMemo, useState } from "react";
import "./App.css";

type TaskStatus = "todo" | "in-progress" | "done";

type Task = {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  createdAt: string;
  updatedAt: string;
};

type TaskDraft = {
  title: string;
  description: string;
  status: TaskStatus;
};

const STATUSES: Array<{ key: TaskStatus; label: string; hint: string }> = [
  { key: "todo", label: "To-Do", hint: "Gather the next moves" },
  { key: "in-progress", label: "In Progress", hint: "Make it real" },
  { key: "done", label: "Done", hint: "Wrap and ship" },
];

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";

const emptyDraft: TaskDraft = {
  title: "",
  description: "",
  status: "todo",
};

const statusLabels: Record<TaskStatus, string> = {
  todo: "To-Do",
  "in-progress": "In Progress",
  done: "Done",
};

const toTaskDraft = (task: Task): TaskDraft => ({
  title: task.title,
  description: task.description || "",
  status: task.status,
});

const BoardColumn = ({
  status,
  title,
  hint,
  tasks,
  onDropTask,
  onEdit,
  onDelete,
}: {
  status: TaskStatus;
  title: string;
  hint: string;
  tasks: Task[];
  onDropTask: (id: string, status: TaskStatus) => void;
  onEdit: (task: Task) => void;
  onDelete: (id: string) => void;
}) => {
  return (
    <section
      className="column"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        const id = event.dataTransfer.getData("text/plain");
        if (id) {
          onDropTask(id, status);
        }
      }}
    >
      <header className="column__header">
        <div>
          <h2>{title}</h2>
          <p>{hint}</p>
        </div>
        <span className="column__count">{tasks.length}</span>
      </header>
      <div className="column__stack">
        {tasks.map((task) => (
          <article
            key={task.id}
            className="task"
            draggable
            onDragStart={(event) => {
              event.dataTransfer.setData("text/plain", task.id);
              event.dataTransfer.effectAllowed = "move";
            }}
          >
            <div className="task__body">
              <h3>{task.title}</h3>
              {task.description ? <p>{task.description}</p> : null}
            </div>
            <div className="task__meta">
              <span>{statusLabels[task.status]}</span>
              <div className="task__actions">
                <button type="button" onClick={() => onEdit(task)}>
                  Edit
                </button>
                <button type="button" onClick={() => onDelete(task.id)}>
                  Delete
                </button>
              </div>
            </div>
          </article>
        ))}
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
  isEditing,
  onClose,
  onChange,
  onSave,
}: {
  open: boolean;
  draft: TaskDraft;
  isSaving: boolean;
  isEditing: boolean;
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
          <h2>{isEditing ? "Edit task" : "Create a task"}</h2>
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

function App() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [draft, setDraft] = useState<TaskDraft>(emptyDraft);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const groupedTasks = useMemo(() => {
    return STATUSES.reduce<Record<TaskStatus, Task[]>>((acc, status) => {
      acc[status.key] = tasks.filter((task) => task.status === status.key);
      return acc;
    }, {} as Record<TaskStatus, Task[]>);
  }, [tasks]);

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
    setEditingTask(null);
    setDraft(emptyDraft);
    setIsModalOpen(true);
  };

  const openEdit = (task: Task) => {
    setEditingTask(task);
    setDraft(toTaskDraft(task));
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingTask(null);
    setDraft(emptyDraft);
  };

  const saveTask = async () => {
    if (!draft.title.trim()) {
      setError("Title is required");
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch(
        editingTask ? `${API_URL}/tasks/${editingTask.id}` : `${API_URL}/tasks`,
        {
          method: editingTask ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: draft.title.trim(),
            description: draft.description.trim(),
            status: draft.status,
          }),
        }
      );

      if (!response.ok) {
        throw new Error("Failed to save task");
      }

      const savedTask: Task = await response.json();
      setTasks((prev) => {
        if (editingTask) {
          return prev.map((task) =>
            task.id === savedTask.id ? savedTask : task
          );
        }
        return [...prev, savedTask];
      });
      setError(null);
      closeModal();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsSaving(false);
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

  return (
    <div className="app">
      <header className="app__header">
        <div>
          <p className="eyebrow">Kanban Task Board</p>
          <h1>Keep work visible. Move it forward.</h1>
          <p className="subhead">
            Drag tasks across your flow. Edit details in a single click.
          </p>
        </div>
        <div className="header__actions">
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
          {STATUSES.map((status) => (
            <BoardColumn
              key={status.key}
              status={status.key}
              title={status.label}
              hint={status.hint}
              tasks={groupedTasks[status.key] || []}
              onDropTask={moveTask}
              onEdit={openEdit}
              onDelete={deleteTask}
            />
          ))}
        </main>
      )}

      <TaskModal
        open={isModalOpen}
        draft={draft}
        isSaving={isSaving}
        isEditing={Boolean(editingTask)}
        onClose={closeModal}
        onChange={setDraft}
        onSave={saveTask}
      />
    </div>
  );
}

export default App;
