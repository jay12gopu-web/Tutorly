(function () {
  if (window.__tutorlyCampusApplied) return;
  window.__tutorlyCampusApplied = true;

  const COURSE_GROUPS = {
    Engineering: ["CSE", "AI & ML", "IT", "ECE", "EEE", "Mechanical", "Civil", "Chemical", "Biotechnology", "Aerospace", "Robotics", "Mechatronics", "Other"],
    Medical: ["MBBS", "BDS", "BAMS", "BHMS", "Nursing", "Pharmacy", "Physiotherapy", "Biotechnology", "Microbiology", "Other"],
    Commerce: ["B.Com", "BBA", "MBA", "Finance", "Economics"],
    Computer: ["BCA", "MCA", "Data Science", "Cybersecurity", "Cloud Computing", "Software Engineering"],
    Law: ["LLB", "LLM"],
    Arts: ["BA", "Psychology", "Sociology", "Political Science", "English", "History"],
    Science: ["B.Sc", "M.Sc", "Physics", "Chemistry", "Mathematics", "Statistics"],
    Other: ["Other"]
  };

  const COLLEGES = ["JNTU Hyderabad", "Osmania University College", "CBIT", "VNR VJIET", "MGIT", "Vasavi College", "IIT Hyderabad", "IIIT Hyderabad", "BITS Pilani Hyderabad", "Other"];
  const UNIVERSITIES = ["JNTUH", "Osmania University", "University of Hyderabad", "Kakatiya University", "Andhra University", "Acharya Nagarjuna University", "Other"];
  const path = (location.pathname.split("/").pop() || "home.html").toLowerCase();
  const $ = (selector, root = document) => root.querySelector(selector);

  function getProfile() {
    return {
      educationLevel: localStorage.getItem("tutorly_education_level") || "school",
      intermediateStream: localStorage.getItem("tutorly_intermediate_stream") || "",
      collegeProgram: localStorage.getItem("tutorly_college_program") || "",
      collegeCourseGroup: localStorage.getItem("tutorly_college_course_group") || "",
      collegeCourse: localStorage.getItem("tutorly_college_course") || "",
      collegeCustomCourse: localStorage.getItem("tutorly_college_custom_course") || "",
      collegeYear: localStorage.getItem("tutorly_college_year") || "",
      collegeSemester: localStorage.getItem("tutorly_college_semester") || "",
      collegeName: localStorage.getItem("tutorly_college_name") || "",
      university: localStorage.getItem("tutorly_university") || "",
      rollNumber: localStorage.getItem("tutorly_roll_number") || "",
      studentId: localStorage.getItem("tutorly_student_id") || "",
      graduationYear: localStorage.getItem("tutorly_graduation_year") || "",
      cgpa: localStorage.getItem("tutorly_cgpa") || ""
    };
  }

  function saveProfile(data) {
    Object.entries(data).forEach(([key, value]) => {
      const storageKey = {
        educationLevel: "tutorly_education_level",
        intermediateStream: "tutorly_intermediate_stream",
        collegeProgram: "tutorly_college_program",
        collegeCourseGroup: "tutorly_college_course_group",
        collegeCourse: "tutorly_college_course",
        collegeCustomCourse: "tutorly_college_custom_course",
        collegeYear: "tutorly_college_year",
        collegeSemester: "tutorly_college_semester",
        collegeName: "tutorly_college_name",
        university: "tutorly_university",
        rollNumber: "tutorly_roll_number",
        studentId: "tutorly_student_id",
        graduationYear: "tutorly_graduation_year",
        cgpa: "tutorly_cgpa"
      }[key];
      if (storageKey) localStorage.setItem(storageKey, value || "");
    });
  }

  function optionList(items, selected = "") {
    return items.map((item) => `<option ${item === selected ? "selected" : ""}>${item}</option>`).join("");
  }

  function enhanceSignup() {
    const form = $("#signupForm");
    if (!form || $("#educationLevel")) return;
    const passwordField = $(".password-field", form);
    const block = document.createElement("section");
    block.className = "campus-section";
    block.style.margin = "12px 0";
    block.innerHTML = `
      <span class="campus-badge">Unified Tutorly Campus</span>
      <h3 style="margin-top:10px;">Choose education level</h3>
      <p style="margin:6px 0 12px;">School students keep the current Tutorly experience. College students unlock Campus setup next.</p>
      <select class="select" id="educationLevel" required>
        <option value="school">School - Classes 1 to 10</option>
        <option value="intermediate">Intermediate</option>
        <option value="college">College</option>
      </select>
    `;
    passwordField.insertAdjacentElement("afterend", block);

    form.addEventListener("submit", () => {
      localStorage.setItem("tutorly_education_level", $("#educationLevel").value);
    }, true);
  }

  function buildInfoFlow() {
    const form = $("#profileForm");
    if (!form || form.dataset.campusEnhanced === "true") return;
    form.dataset.campusEnhanced = "true";
    const profile = getProfile();
    form.innerHTML = `
      <span class="campus-badge">Tutorly Campus Profile</span>
      <h1 class="page-title" style="font-size:42px;margin-top:8px;">Set your learning path</h1>
      <p class="page-sub" style="margin-bottom:14px;">One Tutorly account adapts to school, intermediate, or college learning.</p>

      <div class="campus-choice-grid" role="group" aria-label="Education level">
        ${["school", "intermediate", "college"].map((level) => `
          <button class="campus-option ${profile.educationLevel === level ? "active" : ""}" type="button" data-campus-level="${level}">
            <strong>${level === "school" ? "School" : level === "intermediate" ? "Intermediate" : "College"}</strong>
            <span>${level === "school" ? "Classes 1-10" : level === "intermediate" ? "MPC, BiPC, MEC, CEC, HEC" : "Diploma, UG, PG, semester tools"}</span>
          </button>
        `).join("")}
      </div>
      <input id="campusEducationLevel" type="hidden" value="${profile.educationLevel}" />
      <div id="campusDynamicFields" style="margin-top:14px;"></div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:14px;">
        <a class="btn btn-soft" href="sign_up.html">Back</a>
        <button class="btn btn-primary" type="submit" style="flex:1;min-width:200px;">Continue to Chat</button>
      </div>
    `;

    function renderFields() {
      const level = $("#campusEducationLevel").value;
      const data = getProfile();
      const dynamic = $("#campusDynamicFields");
      if (level === "school") {
        dynamic.innerHTML = `
          <select class="select" id="grade" required>
            <option value="">Select Class</option>
            ${Array.from({ length: 10 }, (_, index) => String(index + 1)).map((grade) => `<option ${localStorage.getItem("tutorly_grade") === grade ? "selected" : ""}>${grade}</option>`).join("")}
          </select>
          <select class="select" id="board" required>
            <option value="">Select Board</option>${optionList(["CBSE", "ICSE", "State Board", "IB", "Cambridge"], localStorage.getItem("tutorly_board") || "")}
          </select>
          <input class="input" id="school" type="text" placeholder="School Name (optional)" value="${localStorage.getItem("tutorly_school") || ""}" />
        `;
        return;
      }
      if (level === "intermediate") {
        dynamic.innerHTML = `
          <select class="select" id="intermediateStream" required>
            <option value="">Select Stream</option>${optionList(["MPC", "BiPC", "MEC", "CEC", "HEC", "Other"], data.intermediateStream)}
          </select>
          <input class="input" id="school" type="text" placeholder="College / Junior College Name (optional)" value="${localStorage.getItem("tutorly_school") || ""}" />
          <select class="select" id="board" required>
            <option value="">Select Board</option>${optionList(["State Board", "CBSE", "ICSE", "IB", "Cambridge"], localStorage.getItem("tutorly_board") || "")}
          </select>
        `;
        return;
      }
      dynamic.innerHTML = `
        <div class="campus-form-grid">
          <select class="select" id="collegeProgram" required>
            <option value="">Select Program</option>${optionList(["Diploma", "Undergraduate", "Postgraduate"], data.collegeProgram)}
          </select>
          <select class="select" id="collegeCourseGroup" required>
            <option value="">Select Course Area</option>${optionList(Object.keys(COURSE_GROUPS), data.collegeCourseGroup)}
          </select>
          <select class="select" id="collegeCourse" required></select>
          <input class="input" id="collegeCustomCourse" type="text" placeholder="Custom course if Other" value="${data.collegeCustomCourse}" />
          <select class="select" id="collegeYear" required>
            <option value="">Select Year</option>${optionList(["1st Year", "2nd Year", "3rd Year", "4th Year", "5th Year"], data.collegeYear)}
          </select>
          <select class="select" id="collegeSemester" required>
            <option value="">Select Semester</option>${optionList(Array.from({ length: 10 }, (_, i) => `Semester ${i + 1}`), data.collegeSemester)}
          </select>
          <input class="input" id="collegeName" list="collegeList" placeholder="College Name" value="${data.collegeName}" required />
          <input class="input" id="university" list="universityList" placeholder="University" value="${data.university}" required />
          <input class="input" id="rollNumber" type="text" placeholder="Roll Number (optional)" value="${data.rollNumber}" />
          <input class="input" id="studentId" type="text" placeholder="Student ID (optional)" value="${data.studentId}" />
          <input class="input" id="graduationYear" type="number" min="2026" max="2045" placeholder="Expected Graduation Year" value="${data.graduationYear}" />
          <input class="input" id="cgpa" type="number" step="0.01" min="0" max="10" placeholder="CGPA (optional)" value="${data.cgpa}" />
        </div>
        <datalist id="collegeList">${COLLEGES.map((item) => `<option value="${item}">`).join("")}</datalist>
        <datalist id="universityList">${UNIVERSITIES.map((item) => `<option value="${item}">`).join("")}</datalist>
      `;
      const groupSelect = $("#collegeCourseGroup");
      const courseSelect = $("#collegeCourse");
      function syncCourses() {
        const list = COURSE_GROUPS[groupSelect.value] || ["Other"];
        courseSelect.innerHTML = `<option value="">Select Course</option>${optionList(list, data.collegeCourse)}`;
      }
      groupSelect.addEventListener("change", syncCourses);
      syncCourses();
    }

    form.querySelectorAll("[data-campus-level]").forEach((button) => {
      button.addEventListener("click", () => {
        form.querySelectorAll("[data-campus-level]").forEach((item) => item.classList.remove("active"));
        button.classList.add("active");
        $("#campusEducationLevel").value = button.dataset.campusLevel;
        renderFields();
      });
    });

    renderFields();

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      const level = $("#campusEducationLevel").value;
      let academicGrade = "";
      let academicBoard = "";
      let academicSchool = "";
      saveProfile({ educationLevel: level });
      if (level === "school") {
        if (!$("#grade").value || !$("#board").value) return alert("Please select your class and board.");
        localStorage.setItem("tutorly_grade", $("#grade").value);
        localStorage.setItem("tutorly_board", $("#board").value);
        localStorage.setItem("tutorly_school", $("#school").value.trim());
        academicGrade = $("#grade").value;
        academicBoard = $("#board").value;
        academicSchool = $("#school").value.trim();
      } else if (level === "intermediate") {
        if (!$("#intermediateStream").value || !$("#board").value) return alert("Please select your stream and board.");
        saveProfile({ intermediateStream: $("#intermediateStream").value });
        localStorage.setItem("tutorly_grade", "11");
        localStorage.setItem("tutorly_board", $("#board").value);
        localStorage.setItem("tutorly_school", $("#school").value.trim());
        academicGrade = "11";
        academicBoard = $("#board").value;
        academicSchool = $("#school").value.trim();
      } else {
        const required = ["collegeProgram", "collegeCourseGroup", "collegeCourse", "collegeYear", "collegeSemester", "collegeName", "university"];
        if (!required.every((id) => $(id).value.trim())) return alert("Please complete required college details.");
        saveProfile({
          collegeProgram: $("#collegeProgram").value,
          collegeCourseGroup: $("#collegeCourseGroup").value,
          collegeCourse: $("#collegeCourse").value,
          collegeCustomCourse: $("#collegeCustomCourse").value,
          collegeYear: $("#collegeYear").value,
          collegeSemester: $("#collegeSemester").value,
          collegeName: $("#collegeName").value.trim(),
          university: $("#university").value.trim(),
          rollNumber: $("#rollNumber").value.trim(),
          studentId: $("#studentId").value.trim(),
          graduationYear: $("#graduationYear").value,
          cgpa: $("#cgpa").value
        });
        localStorage.setItem("tutorly_grade", $("#collegeYear").value);
        localStorage.setItem("tutorly_board", $("#university").value.trim());
        localStorage.setItem("tutorly_school", $("#collegeName").value.trim());
        academicGrade = $("#collegeYear").value;
        academicBoard = $("#university").value.trim();
        academicSchool = $("#collegeName").value.trim();
      }
      try {
        await window.TutorlyAuth.updateAcademicProfile(academicGrade, academicBoard, academicSchool);
      } catch (error) {
        alert(error.message);
        return;
      }
      location.href = "home.html";
    }, true);
  }

  function enhanceProfile() {
    if (path !== "profile.html" || $("#campusProfileCard")) return;
    const settings = $("#settings");
    if (!settings) return;
    const data = getProfile();
    settings.insertAdjacentHTML("afterend", `
      <article class="profile-card pad" id="campusProfileCard">
        <div class="section-head">
          <div>
            <h2>Education Identity</h2>
            <p>Future-ready profile details for school, intermediate, and college learning.</p>
          </div>
          <span class="campus-badge">Campus Ready</span>
        </div>
        <form class="campus-form-grid" id="campusProfileForm">
          <div class="field"><label>Education Level</label><select id="campusProfileLevel"><option value="school">School</option><option value="intermediate">Intermediate</option><option value="college">College</option></select></div>
          <div class="field"><label>Course / Stream</label><input id="campusProfileCourse" type="text" /></div>
          <div class="field"><label>College</label><input id="campusProfileCollege" type="text" /></div>
          <div class="field"><label>University</label><input id="campusProfileUniversity" type="text" /></div>
          <div class="field"><label>Year</label><input id="campusProfileYear" type="text" /></div>
          <div class="field"><label>Semester</label><input id="campusProfileSemester" type="text" /></div>
          <div class="field"><label>CGPA</label><input id="campusProfileCgpa" type="number" step="0.01" min="0" max="10" /></div>
          <div class="field"><label>Student ID</label><input id="campusProfileStudentId" type="text" /></div>
          <button class="button" type="submit"><span>Save Education Details</span></button>
        </form>
      </article>
    `);
    $("#campusProfileLevel").value = data.educationLevel;
    $("#campusProfileCourse").value = data.educationLevel === "intermediate" ? data.intermediateStream : (data.collegeCustomCourse || data.collegeCourse);
    $("#campusProfileCollege").value = data.collegeName || localStorage.getItem("tutorly_school") || "";
    $("#campusProfileUniversity").value = data.university || localStorage.getItem("tutorly_board") || "";
    $("#campusProfileYear").value = data.collegeYear;
    $("#campusProfileSemester").value = data.collegeSemester;
    $("#campusProfileCgpa").value = data.cgpa;
    $("#campusProfileStudentId").value = data.studentId;
    $("#campusProfileForm").addEventListener("submit", (event) => {
      event.preventDefault();
      saveProfile({
        educationLevel: $("#campusProfileLevel").value,
        intermediateStream: $("#campusProfileLevel").value === "intermediate" ? $("#campusProfileCourse").value : data.intermediateStream,
        collegeCourse: $("#campusProfileCourse").value,
        collegeName: $("#campusProfileCollege").value,
        university: $("#campusProfileUniversity").value,
        collegeYear: $("#campusProfileYear").value,
        collegeSemester: $("#campusProfileSemester").value,
        cgpa: $("#campusProfileCgpa").value,
        studentId: $("#campusProfileStudentId").value
      });
      localStorage.setItem("tutorly_school", $("#campusProfileCollege").value || localStorage.getItem("tutorly_school") || "");
      localStorage.setItem("tutorly_board", $("#campusProfileUniversity").value || localStorage.getItem("tutorly_board") || "");
      alert("Education details saved.");
    });

    const headline = $("#studentHeadline");
    if (headline && data.educationLevel === "college") {
      headline.textContent = `${data.collegeProgram || "College"} student | ${data.collegeCustomCourse || data.collegeCourse || "Course not set"} | ${data.collegeSemester || "Semester not set"}`;
    }
  }

  function enhanceSubscriptions() {
    if (path !== "subscriptions.html" || $("#campusPlans")) return;
    const grid = $(".plans-grid");
    if (!grid) return;
    grid.insertAdjacentHTML("beforebegin", `
      <section class="campus-section fade-up d2" id="campusPlans" aria-label="Tutorly subscription comparison" style="margin-top:16px;">
        <span class="campus-badge">Campus plans</span>
        <h2 style="margin-top:10px;">Tutorly vs Tutorly Campus</h2>
        <p>Every user can learn every subject. Campus adds premium college productivity tools.</p>
        <div class="campus-compare-grid">
          <article class="campus-plan-card">
            <span class="campus-badge">Tutorly</span>
            <h2>Tutorly</h2>
            <p>Core learning for school, intermediate, college revision, and general learning.</p>
            <ul>
              <li>AI Tutor, lessons, notes, quizzes, chapter tests, mock exams</li>
              <li>Flashcards, report cards, memory tests, and concentration tests</li>
              <li>School, intermediate, college subjects, engineering, medical, commerce, computer science</li>
            </ul>
            <button class="plan-button" type="button" data-plan-button="plus">Subscribe Tutorly</button>
          </article>
          <article class="campus-plan-card featured">
            <span class="campus-badge">Campus badge</span>
            <h2>Tutorly Campus</h2>
            <p>Everything in Tutorly plus advanced college workspace and career productivity.</p>
            <ul>
              <li>Semester workspace, subjects, credits, attendance, assignments, projects, labs</li>
              <li>CGPA tracker, placement prep, research mode, coding workspace, campus calendar</li>
              <li>Internship hub, career guidance, productivity, advanced analytics, learning roadmap</li>
            </ul>
            <button class="plan-button" type="button" data-plan-button="pro">Subscribe Campus</button>
          </article>
        </div>
      </section>
    `);
    grid.style.display = "none";
    $("#campusPlans").querySelectorAll("[data-plan-button]").forEach((button) => {
      button.addEventListener("click", () => {
        const plan = button.getAttribute("data-plan-button");
        const legacyButton = grid.querySelector(`[data-plan-button="${plan}"]`);
        if (legacyButton) {
          legacyButton.click();
          return;
        }
        const subscription = {
          currentPlan: plan,
          status: "active",
          subscriptionExpiry: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
        };
        localStorage.setItem("tutorly_subscription", JSON.stringify(subscription));
        localStorage.setItem("tutorly_current_plan", plan);
        alert(`${plan === "pro" ? "Tutorly Campus" : "Tutorly"} activated locally.`);
      });
    });
  }

  function enhanceHome() {
    if (path !== "home.html" || $("#campusHomeChat")) return;
    const data = getProfile();
    if (data.educationLevel !== "college") return;
    const content = $(".content") || $(".app-shell") || document.body;
    content.insertAdjacentHTML("afterbegin", `
      <section class="campus-home fade-up d2" id="campusHomeChat">
        <div class="campus-home-head">
          <div>
            <span class="campus-badge">Tutorly Campus</span>
            <h2>Semester Chat</h2>
            <p>${data.collegeName || "College"} | ${data.university || "University"} | ${data.collegeYear || "Year"} | ${data.collegeSemester || "Semester"}</p>
          </div>
          <a class="btn btn-primary" href="subscriptions.html">Campus Tools</a>
        </div>
        <div class="campus-metric-grid">
          <article class="campus-mini-card"><span>Current Subjects</span><strong>6</strong></article>
          <article class="campus-mini-card"><span>Attendance</span><strong>86%</strong></article>
          <article class="campus-mini-card"><span>Assignments</span><strong>4 due</strong></article>
          <article class="campus-mini-card"><span>CGPA</span><strong>${data.cgpa || "Set"}</strong></article>
        </div>
        <div class="campus-tool-grid">
          <article class="campus-tool"><strong>Assignment Assistant</strong><span>Understand questions, build outlines, and learn concepts without plagiarism.</span></article>
          <article class="campus-tool"><strong>Project Assistant</strong><span>Ideas, milestones, references, implementation guidance, and reviews.</span></article>
          <article class="campus-tool"><strong>Lab & Viva Mode</strong><span>Manuals, observations, result explanations, and viva preparation.</span></article>
          <article class="campus-tool"><strong>Placement Prep</strong><span>Resume, HR, technical, coding, aptitude, and communication practice.</span></article>
          <article class="campus-tool"><strong>CGPA Tracker</strong><span>Semester GPA, required GPA, credits, and performance charts.</span></article>
          <article class="campus-tool"><strong>Career Guidance</strong><span>Higher education, exams, jobs, research careers, and startup direction.</span></article>
        </div>
      </section>
    `);
  }

  function updateSubscriptionLabels() {
    if (window.TUTORLY_CAMPUS_LABELS_APPLIED) return;
    window.TUTORLY_CAMPUS_LABELS_APPLIED = true;
    document.querySelectorAll(".plan-name").forEach((node) => {
      if (node.textContent.trim() === "Plus") node.textContent = "Tutorly";
      if (node.textContent.trim() === "Pro") node.textContent = "Tutorly Campus";
    });
  }

  function init() {
    enhanceSignup();
    buildInfoFlow();
    enhanceProfile();
    enhanceSubscriptions();
    enhanceHome();
    updateSubscriptionLabels();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
