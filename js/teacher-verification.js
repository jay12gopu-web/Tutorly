(function () {
  const form = document.getElementById("teacherDegreeForm");
  if (!form) return;

  if (localStorage.getItem("tutorly_account_role") !== "teacher") {
    window.location.replace("sign_up.html");
    return;
  }

  if (!localStorage.getItem("tutorly_teacher_subjects")) {
    window.location.replace("teacher_info.html");
    return;
  }

  if (!localStorage.getItem("tutorly_teacher_location_status")) {
    window.location.replace("teacher_location.html");
    return;
  }

  const degreeList = document.getElementById("degreeList");
  const addDegreeBtn = document.getElementById("addDegreeBtn");
  const submitBtn = document.getElementById("submitDegreeBtn");
  const success = document.getElementById("degreeSuccess");
  let degreeId = 0;

  function validDegreeFile(file) {
    if (!file) return false;
    return /\.(pdf|jpg|jpeg|png)$/i.test(file.name);
  }

  function createDegreeCard(id) {
    const card = document.createElement("article");
    card.className = "degree-entry";
    card.dataset.degreeEntry = "";
    card.innerHTML = `
      <div class="degree-entry-top">
        <strong>Degree ${id + 1}</strong>
        ${id > 0 ? '<button class="remove-degree-btn" type="button">Remove</button>' : ""}
      </div>
      <div class="degree-grid">
        <label>
          <span>Degree Name</span>
          <input class="input" data-degree-field="degreeName" type="text" placeholder="B.Ed, M.Sc, B.Tech..." required />
        </label>
        <label>
          <span>Institution Name</span>
          <input class="input" data-degree-field="institutionName" type="text" required />
        </label>
        <label>
          <span>Year Completed</span>
          <input class="input" data-degree-field="yearCompleted" type="number" min="1950" max="2035" required />
        </label>
        <label>
          <span>Field of Study</span>
          <input class="input" data-degree-field="fieldOfStudy" type="text" placeholder="Mathematics, Physics..." required />
        </label>
        <div class="degree-upload">
          <input id="degreeFile${id}" data-degree-field="degreeCertificate" type="file" accept=".pdf,.jpg,.jpeg,.png" required />
          <label for="degreeFile${id}">
            <strong>Upload Degree Certificate</strong>
            <span>PDF, JPG, JPEG, PNG</span>
            <em>No file selected</em>
          </label>
        </div>
      </div>
    `;

    card.querySelector(".remove-degree-btn")?.addEventListener("click", () => {
      card.remove();
      updateSubmitState();
    });

    const fileInput = card.querySelector('input[type="file"]');
    const fileName = card.querySelector(".degree-upload em");
    fileInput.addEventListener("change", () => {
      const file = fileInput.files?.[0];
      if (!validDegreeFile(file)) {
        fileInput.value = "";
        fileName.textContent = "Unsupported file type";
        card.classList.add("degree-file-error");
      } else {
        fileName.textContent = file.name;
        card.classList.remove("degree-file-error");
      }
      updateSubmitState();
    });

    card.addEventListener("input", updateSubmitState);
    return card;
  }

  function addDegree() {
    degreeList.appendChild(createDegreeCard(degreeId));
    degreeId += 1;
    updateSubmitState();
  }

  function degreeEntries() {
    return Array.from(document.querySelectorAll("[data-degree-entry]"));
  }

  function entryComplete(entry) {
    const textInputs = Array.from(entry.querySelectorAll('input:not([type="file"])'));
    const fileInput = entry.querySelector('input[type="file"]');
    return textInputs.every((input) => input.value.trim()) && validDegreeFile(fileInput.files?.[0]);
  }

  function updateSubmitState() {
    const entries = degreeEntries();
    submitBtn.disabled = entries.length === 0 || !entries.every(entryComplete);
  }

  function collectDegrees() {
    return degreeEntries().map((entry) => {
      const data = {};
      entry.querySelectorAll("[data-degree-field]").forEach((field) => {
        if (field.type === "file") {
          const file = field.files?.[0];
          data[field.dataset.degreeField] = file ? {
            name: file.name,
            size: file.size,
            type: file.type || "unknown"
          } : null;
        } else {
          data[field.dataset.degreeField] = field.value.trim();
        }
      });
      return data;
    });
  }

  addDegreeBtn.addEventListener("click", addDegree);

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    updateSubmitState();
    if (submitBtn.disabled) {
      form.reportValidity();
      return;
    }

    const payload = {
      teacherName: localStorage.getItem("tutorly_signup_full_name") || "",
      degrees: collectDegrees(),
      submittedAt: new Date().toISOString(),
      status: "Submitted"
    };

    localStorage.setItem("tutorly_teacher_degree_details", JSON.stringify(payload));
    localStorage.setItem("tutorly_teacher_degree_status", "Submitted");
    form.hidden = true;
    success.hidden = false;
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  addDegree();
})();
