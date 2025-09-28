// scripts/task.js
(function (global) {
  // Avoid redeclaration if Task already exists
  if (!global.Task) {
    class Task {
      constructor(
        title,
        description,
        color,
        date,
        status,
        budget,
        priority,
        createdBy,
        assignedTo
      ) {
        this.id = Date.now();
        this.title = title;
        this.description = description; // fixed field name
        this.color = color;
        this.date = date;
        this.status = status;
        this.budget = budget;
        this.priority = typeof priority !== "undefined" ? Number(priority) : 5; // default priority 5
        this.createdBy = createdBy || null;
        this.assignedTo = assignedTo || null;
      }
    }
    global.Task = Task;
  }

  // Provide a shared namespace for apps.js
  global.MPS = global.MPS || {};
  // Prefer existing MPS.Task; otherwise map to global Task
  global.MPS.Task = global.MPS.Task || global.Task;
})(window);
