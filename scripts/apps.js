// scripts/apps.js
// Requires jQuery. Load task.js BEFORE this file if you want to use its Task class.

const api =
  "https://106api-b0bnggbsgnezbzcz.westus3-01.azurewebsites.net/api/tasks";
window.MPS = window.MPS || {};

(function () {
  ("use strict");

  // -------- Storage --------
  const STORAGE_KEY = "mps_tasks";
  const USER_KEY = "mps_user"; // stores current user identifier (email or id)

  // -------- State --------
  let tasks = [];
  let editingId = null; // null = create mode; number = editing task id

  // -------- Model (coexist with task.js) --------
  window.MPS.Task =
    window.MPS.Task ||
    window.Task ||
    function (title, description, color, date, status, budget, priority) {
      this.id = Date.now();
      this.title = title;
      this.description = description;
      this.color = color;
      this.date = date;
      this.status = status;
      this.budget = budget;
      this.priority = typeof priority !== 'undefined' ? Number(priority) : 5;
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
      // Ensure priority
      if (typeof t.priority === 'undefined' || t.priority === null) t.priority = 5;
    });
  }

  function saveTasks() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  }

  function getCurrentUser() {
    let u = localStorage.getItem(USER_KEY);
    if (!u) {
      // ask the user for a simple identifier (email preferred)
      u = prompt("Please enter your email (used to scope your tasks):", "");
      if (!u) u = "anonymous" + Math.floor(Math.random() * 10000);
      localStorage.setItem(USER_KEY, u);
    }
    return u;
  }

  const currentUser = getCurrentUser();

  // Helper that checks many likely user fields returned by the API
  function belongsToCurrentUser(t) {
    if (!t) return false;
    const v = (
      t.user ||
      t.owner ||
      t.email ||
      t.userEmail ||
      t.userId ||
      ""
    ).toString();
    return v === currentUser;
  }

  // Small wrapper to return a Promise for $.ajax
  function ajaxPromise(opts) {
    return new Promise((resolve, reject) => {
      $.ajax(opts)
        .done((res) => resolve(res))
        .fail((err) => reject(err));
    });
  }

  // -------- Server sync --------
  async function fetchTasksFromServer() {
    try {
      const res = await ajaxPromise({ type: "GET", url: api });
      const arr = Array.isArray(res) ? res : [];
      // keep only tasks that belong to the current user (best-effort)
      tasks = arr.filter((t) => belongsToCurrentUser(t));
      // If server tasks lack an 'id' field but have '_id', normalize
      tasks = tasks.map((t) => {
        if (!t.id && t._id) t.id = t._id;
        return t;
      });
      saveTasks();
      console.log(
        `[FETCH] Fetched ${tasks.length} tasks for user ${currentUser} from server`
      );
      renderTasks();
    } catch (err) {
      console.error(
        "Failed to fetch tasks from server, falling back to local:",
        err
      );
      // fallback to local storage previously loaded
      loadTasks();
      renderTasks();
    }
  }

  async function createTaskOnServer(task) {
    // attach current user info
    const payload = { ...task, user: currentUser, createdBy: task.createdBy || currentUser, assignedTo: task.assignedTo || null };
    try {
      const res = await ajaxPromise({
        type: "POST",
        url: api,
        data: JSON.stringify(payload),
        contentType: "application/json",
      });
      // server should return created task; normalize id
      const created = res && res.id ? res : { ...payload, ...(res || {}) };
      if (!created.id && created._id) created.id = created._id;
      tasks.push(created);
      saveTasks();
      renderTasks();
      console.log(`[SAVE] Task created (id: ${created.id})`, created);
      return created;
    } catch (err) {
      console.error("Failed to create task on server, saving locally:", err);
      // local fallback
      if (!("id" in task)) task.id = Date.now();
      tasks.push(task);
      saveTasks();
      renderTasks();
      console.log(`[SAVE][LOCAL] Task saved locally (id: ${task.id})`, task);
      throw err;
    }
  }

  async function updateTaskOnServer(id, values) {
    const payload = { ...values, user: currentUser, createdBy: values.createdBy || currentUser, assignedTo: values.assignedTo || null };
    try {
      const res = await ajaxPromise({
        type: "PUT",
        url: `${api}/${id}`,
        data: JSON.stringify(payload),
        contentType: "application/json",
      });
      // update local copy with server response if present
      const updated =
        res && (res.id || res._id)
          ? { ...payload, ...(res || {}) }
          : { ...payload, id };
      const idx = tasks.findIndex((t) => t.id === id);
      if (idx >= 0) {
        tasks[idx] = { ...tasks[idx], ...updated };
        console.log(`[UPDATE] Task updated (id: ${id})`, tasks[idx]);
      }
      saveTasks();
      renderTasks();
      return updated;
    } catch (err) {
      console.error("Failed to update task on server, updating locally:", err);
      const idx = tasks.findIndex((t) => t.id === id);
      if (idx >= 0) tasks[idx] = { ...tasks[idx], ...values };
      saveTasks();
      renderTasks();
      console.log(
        `[UPDATE][LOCAL] Task updated locally (id: ${id})`,
        tasks.find((t) => t.id === id)
      );
      throw err;
    }
  }

  async function deleteTaskOnServer(id) {
    try {
      await ajaxPromise({ type: "DELETE", url: `${api}/${id}` });
      tasks = tasks.filter((t) => t.id !== id);
      saveTasks();
      renderTasks();
      console.log(`[DELETE] Task deleted (id: ${id})`);
    } catch (err) {
      console.error("Failed to delete task on server, removing locally:", err);
      tasks = tasks.filter((t) => t.id !== id);
      saveTasks();
      renderTasks();
      console.log(`[DELETE][LOCAL] Task removed locally (id: ${id})`);
      throw err;
    }
  }

  async function deleteAllTasksOnServer() {
    if (!tasks.length) return;
    if (!confirm("Delete ALL your tasks? This cannot be undone.")) return;
    // clear API test log when user confirms delete all
    clearTestLog();
    // attempt to delete each one in parallel where possible
    const ids = tasks.map((t) => t.id).filter(Boolean);
    try {
      await Promise.all(
        ids.map((id) => ajaxPromise({ type: "DELETE", url: `${api}/${id}` }))
      );
      tasks = [];
      saveTasks();
      renderTasks();
      console.log("[DELETE ALL] All tasks deleted for user", currentUser);
    } catch (err) {
      console.error("Error deleting some tasks:", err);
      // best-effort local cleanup for any tasks that were removed server-side
      tasks = [];
      saveTasks();
      renderTasks();
      console.log("[DELETE ALL][LOCAL] Cleared local tasks after error", err);
      throw err;
    }
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
      const pNum = Number(t.priority ?? 5);
      const pText = pNum <= 3 ? "High" : pNum <= 7 ? "Med" : "Low";
      const card = `
  <div class="col-12">
    <div class="card h-100 task-card text-dark" data-priority="${escapeHtml(
          pNum
        )}" data-priority-text="${escapeHtml(pText)}"
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
              <th scope="row">Created By</th>
              <td>${escapeHtml(t.createdBy || "")}</td>
            </tr>
            <tr>
              <th scope="row">Assigned To</th>
              <td>${escapeHtml(t.assignedTo || "")}</td>
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
              <th scope="row">Priority</th>
              <td>${escapeHtml(t.priority ?? 5)}</td>
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
      priority: $("#numPriority").val(),
      override: $("#chkOverride").prop("checked"),
      createdBy: $("#txtCreatedBy").val().trim(),
      assignedTo: $("#txtAssignedTo").val().trim(),
    };
  }

  function fillForm(task) {
    $("#txtTitle").val(task.title || "");
    $("#descriptionInput").val(task.description || "");
    $("#selCol").val(task.color || "#0d6efd");
    $("#dateTimeLocal").val(task.date || "");
    $("#selStatus").val(task.status || "New");
    $("#numBudget").val(task.budget ?? "");
    $("#numPriority").val(task.priority ?? 5);
    $("#txtCreatedBy").val(task.createdBy || currentUser);
    $("#txtAssignedTo").val(task.assignedTo || "");
  }

  function clearForm() {
    const form = document.getElementById("taskForm");
    if (form) form.reset();
    if (!$("#selCol").val()) $("#selCol").val("#0d6efd"); // keep color sane
    if ($("#numPriority").length) $("#numPriority").val(5);
    if ($("#chkOverride").length) $("#chkOverride").prop("checked", false);
    if ($("#txtCreatedBy").length) $("#txtCreatedBy").val(currentUser);
    if ($("#txtAssignedTo").length) $("#txtAssignedTo").val("");
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
    const p = Number(values.priority);
    if (isNaN(p) || p < 1 || p > 10) return "Please enter a priority between 1 and 10.";
    return null;
  }

  // Check for conflicts: same date/time as any existing task (excluding optional editingId)
  function checkConflict(values, editingId) {
    if (!values.date) return null;
    const newTime = new Date(values.date).getTime();
    if (isNaN(newTime)) return null;
    for (const t of tasks) {
      if (!t || !t.date) continue;
      // skip the task being edited
      if (editingId && t.id === editingId) continue;
      const tTime = new Date(t.date).getTime();
      if (isNaN(tTime)) continue;
      if (tTime === newTime) return t; // conflict found
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
    // Check for scheduling conflicts (same exact date/time)
    const conflict = checkConflict(vals, editingId);
    if (conflict) {
      if (vals.override) {
        console.log("[CONFLICT] Override checked; proceeding to save despite conflict.");
      } else {
        const ok = confirm(
          `This task conflicts with existing task "${conflict.title || 'Untitled'}" scheduled at the same time. Save anyway?`
        );
        if (!ok) return;
      }
    }
    if (editingId) {
      console.log(`[ACTION] User requested update for task id ${editingId}`);
      // ensure priority is numeric
      vals.priority = Number(vals.priority);
      // Update existing task on server (with local fallback inside function)
      updateTaskOnServer(editingId, vals)
        .then(() => {
          exitEditMode();
        })
        .catch(() => {
          // still exit edit mode on error
          exitEditMode();
        });
    } else {
      console.log("[ACTION] User requested create task", vals.title);
      // Create new task on server (createTaskOnServer will push to local tasks)
      // If there's a Task class that attaches extra behavior, honor it when creating the payload
      const TaskCtor = window.MPS.Task;
      const temp = new TaskCtor(
        vals.title,
        vals.description,
        vals.color,
        vals.date,
        vals.status,
        vals.budget,
        vals.priority
      );
      // Compose payload from vals but keep any extra fields from the ctor instance
      const payload = { ...temp, ...vals, priority: Number(vals.priority) };
      // Ensure no sharing of prototype methods when stringifying
      createTaskOnServer(payload)
        .then(() => {
          clearForm();
        })
        .catch(() => {
          // already handled inside createTaskOnServer
          clearForm();
        });
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
        // clear API test log when user confirms delete
        clearTestLog();
        // delete via server wrapper which has a local fallback
        deleteTaskOnServer(id).catch(() => {
          // ignore, UI already updated in fallback
        });
        if (editingId === id) exitEditMode();
      }
    }
  }

  // -------- Init --------
  function init() {
    // load local tasks quickly so UI is not empty while network request runs
    loadTasks();
    // ensure the createdBy field defaults to current user
    $("#txtCreatedBy").val(currentUser);
    renderTasks();
    // attempt to fetch from server and reconcile
    fetchTasksFromServer();
    // optional quick API test (keeps console noise separate)
    test();

    // Bind to form submit so Enter key works and page doesn't reload
    $("#taskForm").on("submit", onSave);
    // Optional: also bind the button click
    $("#btnSave").on("click", onSave);

    // Delete all tasks button
    $("#btnDeleteAll").on("click", function () {
      deleteAllTasksOnServer().catch(() => {
        // errors already logged in the function
      });
    });

    // API test button
    $("#btnApiTest").on("click", function () {
      // run the async test and log to console
      testApiCRUD().catch((err) => console.error("testApiCRUD error:", err));
    });

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

  // ---- Full CRUD test that logs each step ----
  async function testApiCRUD() {
    console.log("[API TEST] Starting API CRUD test...");
    clearTestLog();
    setTestButtonState(true);
    try {
      const list = await ajaxPromise({ type: "GET", url: api });
      const count = Array.isArray(list) ? list.length : 0;
      console.log("[API TEST] Connected to API, tasks returned:", count);
      logTestResult(`Connected to API — ${count} tasks returned`, "pass");
    } catch (err) {
      console.error("[API TEST] Failed to connect to API:", err);
      logTestResult("Failed to connect to API", "fail", err);
      setTestButtonState(false);
      return;
    }

    const ts = Date.now();
    const payload = {
      title: `API_TEST_${ts}`,
      description: "Temporary test task created by testApiCRUD",
      color: "#ff0000",
      date: new Date().toISOString(),
      status: "Test",
      budget: 0,
      user: currentUser,
    };

    let created;
    try {
      created = await ajaxPromise({
        type: "POST",
        url: api,
        data: JSON.stringify(payload),
        contentType: "application/json",
      });
      if (!created.id && created._id) created.id = created._id;
      console.log("[API TEST] Create successful:", created);
      if (created && (created.id || created._id)) {
        logTestResult(`Create succeeded (id: ${created.id || created._id})`, "pass", created);
      } else {
        logTestResult("Create returned unexpected response", "fail", created);
      }
    } catch (err) {
      console.error("[API TEST] Create failed:", err);
      logTestResult("Create failed", "fail", err);
      setTestButtonState(false);
      return;
    }

    try {
      const updatePayload = {
        ...payload,
        title: payload.title + "_UPDATED",
        user: currentUser,
      };
      const updated = await ajaxPromise({
        type: "PUT",
        url: `${api}/${created.id}`,
        data: JSON.stringify(updatePayload),
        contentType: "application/json",
      });
      console.log("[API TEST] Update response:", updated);
      if (updated && (updated.id || updated._id || updated.title === updatePayload.title)) {
        logTestResult(`Update succeeded (id: ${created.id})`, "pass", updated);
      } else {
        logTestResult("Update returned unexpected response", "fail", updated);
      }
    } catch (err) {
      console.error("[API TEST] Update failed:", err);
      logTestResult("Update failed", "fail", err);
    }

    try {
      const after = await ajaxPromise({ type: "GET", url: api });
      const found = (Array.isArray(after) ? after : []).find(
        (t) =>
          t.id === created.id || t._id === created.id || t.id === created._id
      );
      console.log("[API TEST] After update, fetched item:", found);
      if (found) logTestResult("Verified task present after update", "pass", found);
      else logTestResult("Could not verify updated task via GET", "fail", after);
    } catch (err) {
      console.warn("[API TEST] Could not verify via GET all:", err);
      logTestResult("Verification GET failed", "fail", err);
    }

    try {
      await ajaxPromise({ type: "DELETE", url: `${api}/${created.id}` });
      console.log("[API TEST] Delete successful for id", created.id);
      logTestResult(`Delete succeeded (id: ${created.id})`, "pass");
    } catch (err) {
      console.error("[API TEST] Delete failed:", err);
      logTestResult("Delete failed", "fail", err);
    }
    console.log("[API TEST] CRUD test completed.");
    logTestResult("CRUD test completed", "info");
    setTestButtonState(false);
  }

  // Expose test function for console use
  window.MPS = window.MPS || {};
  window.MPS.testApiCRUD = testApiCRUD;

  // ---- UI helpers for test log ----
  function logTestResult(message, status, data) {
    // status: 'pass' | 'fail' | 'info'
    const $out = $("#apiTestLog");
    if (!$out.length) return;
    const time = new Date().toLocaleTimeString();
    const badgeClass = status === "pass" ? "bg-success" : status === "fail" ? "bg-danger" : "bg-secondary";
    const $row = $(
      `<div class="d-flex align-items-start mb-1"><span class="badge ${badgeClass} me-2">${status.toUpperCase()}</span><div><div class="small text-muted">${time}</div><div>${escapeHtml(message)}</div></div></div>`
    );
    $out.prepend($row);
    if (data) console.log(`[API TEST][DATA] ${message}`, data);
  }

  function clearTestLog() {
    const $out = $("#apiTestLog");
    if ($out.length) $out.empty();
  }

  function setTestButtonState(disabled) {
    const $btn = $("#btnApiTest");
    if (!$btn.length) return;
    $btn.prop("disabled", !!disabled);
    if (disabled) $btn.text("Testing...");
    else $btn.text("Test API");
  }

  $(init);
})();
