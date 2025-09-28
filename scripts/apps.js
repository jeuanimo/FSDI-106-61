// scripts/apps.js
// Requires jQuery. Load task.js BEFORE this file if you want to use its Task class.

const api =
  "https://106api-b0bnggbsgnezbzcz.westus3-01.azurewebsites.net/api/tasks";
window.MPS = window.MPS || {};

(function () {
  ("use strict");

  // -------- Storage --------
  const STORAGE_KEY = "mps_tasks";

  // -------- State --------
  let tasks = [];
  let editingId = null; // null = create mode; number = editing task id

  // -------- Model (coexist with task.js) --------
  window.MPS.Task =
    window.MPS.Task ||
    window.Task ||
    function (title, description, color, date, status, budget) {
      this.id = Date.now();
      this.title = title;
      this.description = description;
      this.color = color;
      this.date = date;
      this.status = status;
      this.budget = budget;
    };

  // -------- Helpers: formatting --------
  const fmtCurrency = new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
  function fmtDate(s) {
    if (!s) return "-";
    const d = new Date(s);
    return isNaN(d)
      ? "-"
      : new Intl.DateTimeFormat(undefined, {
          year: "numeric",
          month: "short",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        }).format(d);
  }

  function escapeHtml(str) {
    return String(str)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  // -------- Storage Helpers --------
  function loadTasks() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      tasks = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(tasks)) tasks = [];
    } catch (e) {
      console.warn("Failed to parse tasks from storage:", e);
      tasks = [];
    }
    // Migrations / sanity:
    tasks.forEach((t) => {
      // Legacy: description stored as "x"
      if (t && t.x && !t.description) t.description = t.x;
      // Ensure id
      if (!t.id) t.id = Date.now() + Math.floor(Math.random() * 1000);
    });
  }

  function saveTasks() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  }

  // -------- Render --------
  function renderTasks() {
    const $list = $("#tasksList");
    const $empty = $("#tasksEmpty");

    if (!$list.length) {
      console.warn("#tasksList not found in DOM");
      return;
    }

    $list.empty();

    if (!tasks.length) {
      $empty.show();
      return;
    }
    $empty.hide();

    tasks.forEach((t) => {
      const card = `
  <div class="col-12">
    <div class="card h-100 task-card text-dark"
         style="--accent:${escapeHtml(
           t.color || "#0d6efd"
         )}; border-color:${escapeHtml(t.color || "#0d6efd")}">
      <div class="card-body p-0">
        <table class="table table-sm mb-0 task-table task-table-rows">
          <tbody>
            <tr>
              <th scope="row">Title</th>
              <td class="fw-semibold">${escapeHtml(t.title || "Untitled")}</td>
            </tr>
            <tr>
              <th scope="row">Description</th>
              <td class="desc-cell">
                <span class="desc-text">${escapeHtml(
                  t.description || ""
                )}</span>
              </td>
            </tr>
            <tr>
              <th scope="row">Date</th>
              <td>${escapeHtml(fmtDate(t.date))}</td>
            </tr>
            <tr>
              <th scope="row">Status</th>
              <td>${escapeHtml(t.status || "-")}</td>
            </tr>
            <tr>
              <th scope="row">Budget</th>
              <td>${escapeHtml(fmtCurrency.format(Number(t.budget) || 0))}</td>
            </tr>
            <tr>
              <th scope="row">Color</th>
              <td>
                <span class="d-inline-block rounded-circle border align-middle"
                      style="width:12px;height:12px;background:${escapeHtml(
                        t.color || "#0d6efd"
                      )}; border-color:#000"></span>
                <span class="ms-2 align-middle">${escapeHtml(
                  t.color || "#0d6efd"
                )}</span>
              </td>
            </tr>
            <tr>
              <td colspan="2" class="text-end">
                <button class="btn btn-sm btn-outline-primary btn-edit me-1" data-id="${
                  t.id
                }">Edit</button>
                <button class="btn btn-sm btn-outline-danger btn-delete" data-id="${
                  t.id
                }">Delete</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
`;

      $list.append(card);
    });

    // Ensure grid classes exist (in case HTML not updated)
    $list.addClass("row row-cols-1 row-cols-sm-2 row-cols-lg-3 g-4");
  }

  // -------- Form Helpers --------
  function readForm() {
    return {
      title: $("#txtTitle").val().trim(),
      description: $("#descriptionInput").val().trim(),
      color: $("#selCol").val(),
      date: $("#dateTimeLocal").val(),
      status: $("#selStatus").val(),
      budget: $("#numBudget").val(),
    };
  }

  function fillForm(task) {
    $("#txtTitle").val(task.title || "");
    $("#descriptionInput").val(task.description || "");
    $("#selCol").val(task.color || "#0d6efd");
    $("#dateTimeLocal").val(task.date || "");
    $("#selStatus").val(task.status || "New");
    $("#numBudget").val(task.budget ?? "");
  }

  function clearForm() {
    const form = document.getElementById("taskForm");
    if (form) form.reset();
    if (!$("#selCol").val()) $("#selCol").val("#0d6efd"); // keep color sane
  }

  function enterEditMode(task) {
    editingId = task.id;
    fillForm(task);
    $("#btnSave").text("Update");
    $("#btnCancel").prop("hidden", false);
  }

  function exitEditMode() {
    editingId = null;
    clearForm();
    $("#btnSave").text("Save");
    $("#btnCancel").prop("hidden", true);
  }

  // -------- Validation (simple) --------
  function validate(values) {
    if (!values.title) return "Please enter a title.";
    if (!values.description) return "Please enter a description.";
    if (!values.color) return "Please pick a color.";
    if (!values.date) return "Please select a date/time.";
    if (!values.status) return "Please select a status.";
    if (
      values.budget === "" ||
      isNaN(values.budget) ||
      Number(values.budget) < 0
    ) {
      return "Please enter a valid non-negative budget.";
    }
    return null;
  }

  // -------- Events --------
  function onSave(e) {
    e.preventDefault();
    const vals = readForm();
    const error = validate(vals);
    if (error) {
      alert(error);
      return;
    }

    if (editingId) {
      // Update existing task
      const idx = tasks.findIndex((t) => t.id === editingId);
      if (idx >= 0) {
        tasks[idx] = {
          ...tasks[idx],
          title: vals.title,
          description: vals.description,
          color: vals.color,
          date: vals.date,
          status: vals.status,
          budget: vals.budget,
        };
      }
      saveTasks();
      renderTasks();
      exitEditMode();
    } else {
      // Create new task (honor task.js class if present)
      const TaskCtor = window.MPS.Task;
      const t = new TaskCtor(
        vals.title,
        vals.description,
        vals.color,
        vals.date,
        vals.status,
        vals.budget
      );
      if (!("id" in t)) t.id = Date.now(); // ensure an id if class lacks one
      tasks.push(t);
      saveTasks();
      renderTasks();
      clearForm();
    }
  }

  function onCancel() {
    exitEditMode();
  }

  // Delegated edit/delete on the list
  function onTasksClick(e) {
    const $btn = $(e.target).closest("button");
    if (!$btn.length) return;

    const id = Number($btn.data("id"));
    if (!id) return;

    if ($btn.hasClass("btn-edit")) {
      const task = tasks.find((t) => t.id === id);
      if (task) enterEditMode(task);
    } else if ($btn.hasClass("btn-delete")) {
      if (confirm("Delete this task?")) {
        tasks = tasks.filter((t) => t.id !== id);
        saveTasks();
        renderTasks();
        if (editingId === id) exitEditMode();
      }
    }
  }

  // -------- Init --------
  function init() {
    loadTasks();
      renderTasks();
      test()

    // Bind to form submit so Enter key works and page doesn't reload
    $("#taskForm").on("submit", onSave);
    // Optional: also bind the button click
    $("#btnSave").on("click", onSave);

    $("#btnCancel").on("click", onCancel);
    $("#btnReset").on("click", () => {
      if (editingId) exitEditMode();
      else clearForm();
    });

    $("#tasksList").on("click", onTasksClick);
    console.log("App ready");
  }
  // ---- Optional: test the API ----
  function test() {
    $.ajax({
      type: "GET",
      url: api,
      success: function (res) {
        console.log("Server says", res);
      },
      error: function (error) {
        console.error("Error on api", error);
      },
    }); // <-- close $.ajax
  } // <-- close test()

  $(init);
})();
