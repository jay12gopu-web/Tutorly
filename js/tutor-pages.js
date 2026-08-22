(function () {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  document.body.appendChild(toast);

  let toastTimer = null;
  function showToast(message) {
    toast.textContent = message;
    toast.classList.add('show');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove('show'), 2200);
  }

  const offlineTutors = [
    { name: 'Ananya Rao', initials: 'AR', subjects: ['Maths', 'Science'], location: 'Hyderabad', distance: '1.8 km', rating: '4.9', fee: 'Rs 450/hr', availability: 'Today evening' },
    { name: 'Rahul Mehta', initials: 'RM', subjects: ['Physics', 'Chemistry'], location: 'Secunderabad', distance: '3.2 km', rating: '4.8', fee: 'Rs 550/hr', availability: 'Weekends' },
    { name: 'Kavya Singh', initials: 'KS', subjects: ['English', 'Social Studies'], location: 'Madhapur', distance: '4.1 km', rating: '4.7', fee: 'Rs 400/hr', availability: 'After school' },
    { name: 'Arjun Varma', initials: 'AV', subjects: ['Maths', 'Biology'], location: 'Kukatpally', distance: '5.5 km', rating: '4.8', fee: 'Rs 500/hr', availability: 'Morning slots' }
  ];

  const onlineTutors = [
    { name: 'Meera Iyer', initials: 'MI', subjects: ['Maths', 'Physics'], mode: 'Live class', rating: '4.9', fee: 'Rs 299/session', availability: 'Starts in 20 min' },
    { name: 'Dev Sharma', initials: 'DS', subjects: ['Science', 'Chemistry'], mode: '1-on-1', rating: '4.8', fee: 'Rs 349/session', availability: 'Today 7:00 PM' },
    { name: 'Nisha Kapoor', initials: 'NK', subjects: ['English', 'History'], mode: 'Live class', rating: '4.9', fee: 'Rs 249/session', availability: 'Tomorrow' },
    { name: 'Rohan Das', initials: 'RD', subjects: ['Geography', 'Biology'], mode: '1-on-1', rating: '4.7', fee: 'Rs 299/session', availability: 'Flexible' }
  ];

  function saveBooking(type, tutor) {
    const bookings = JSON.parse(localStorage.getItem('tutorly_tutor_bookings') || '[]');
    bookings.unshift({
      type,
      tutor: tutor.name,
      subjects: tutor.subjects.join(', '),
      time: new Date().toISOString()
    });
    localStorage.setItem('tutorly_tutor_bookings', JSON.stringify(bookings.slice(0, 8)));
  }

  function renderTutorCards(list, container, type) {
    if (!container) return;
    if (!list.length) {
      container.innerHTML = '<div class="empty-state">No tutors matched that search yet. Try a nearby area or another subject.</div>';
      return;
    }

    container.innerHTML = list.map((tutor, index) => `
      <article class="tutor-card" data-index="${index}">
        <div class="tutor-avatar">${tutor.initials}</div>
        <div>
          <h3>${tutor.name}</h3>
          <div class="tutor-meta">
            <span class="tutor-chip">${tutor.subjects.join(' + ')}</span>
            <span class="tutor-chip gold">${tutor.rating} rating</span>
            <span class="tutor-chip green">${tutor.availability}</span>
            <span class="tutor-chip">${type === 'offline' ? tutor.distance : tutor.mode}</span>
            <span class="tutor-chip">${tutor.fee}</span>
          </div>
        </div>
        <button class="tutor-btn" type="button" data-book="${index}">${type === 'offline' ? 'Request' : 'Book'}</button>
      </article>
    `).join('');

    container.querySelectorAll('[data-book]').forEach((button) => {
      button.addEventListener('click', () => {
        const tutor = list[Number(button.dataset.book)];
        saveBooking(type, tutor);
        showToast(`${tutor.name} added to your tutor requests.`);
        renderBookingList();
      });
    });
  }

  function renderBookingList() {
    const list = document.getElementById('bookingList');
    if (!list) return;
    const bookings = JSON.parse(localStorage.getItem('tutorly_tutor_bookings') || '[]');
    list.innerHTML = bookings.length
      ? bookings.map((booking) => `<div class="booking-item"><strong>${booking.tutor}</strong><br><span>${booking.type} tutor request - ${booking.subjects}</span></div>`).join('')
      : '<div class="empty-state">Your tutor requests will appear here.</div>';
  }

  function initTutorFinder(type) {
    const data = type === 'offline' ? offlineTutors : onlineTutors;
    const resultList = document.getElementById('tutorResults');
    const subject = document.getElementById('subjectFilter');
    const location = document.getElementById('locationFilter');
    const mode = document.getElementById('modeFilter');
    const form = document.getElementById('finderForm');

    function applyFilters() {
      const subjectValue = (subject?.value || '').toLowerCase();
      const locationValue = (location?.value || '').toLowerCase();
      const modeValue = (mode?.value || '').toLowerCase();

      const filtered = data.filter((tutor) => {
        const subjectMatch = !subjectValue || tutor.subjects.some((item) => item.toLowerCase().includes(subjectValue));
        const locationMatch = !locationValue || (tutor.location || '').toLowerCase().includes(locationValue);
        const modeMatch = !modeValue || (tutor.mode || '').toLowerCase().includes(modeValue);
        return subjectMatch && locationMatch && modeMatch;
      });
      renderTutorCards(filtered, resultList, type);
    }

    form?.addEventListener('submit', (event) => {
      event.preventDefault();
      applyFilters();
    });
    [subject, location, mode].forEach((input) => input?.addEventListener('input', applyFilters));
    applyFilters();
    renderBookingList();
  }

  function initAskDoubtPage() {
    const form = document.getElementById('askDoubtForm');
    const question = document.getElementById('doubtQuestion');
    const subject = document.getElementById('doubtSubject');
    const level = document.getElementById('doubtLevel');
    const file = document.getElementById('doubtFile');
    const uploadZone = document.getElementById('uploadZone');
    const preview = document.getElementById('uploadPreview');
    const previewName = document.getElementById('uploadPreviewName');
    const removeFile = document.getElementById('removeDoubtFile');

    function updatePreview() {
      const selected = file?.files && file.files[0];
      if (!selected) {
        preview?.classList.remove('show');
        if (previewName) previewName.textContent = '';
        return;
      }
      if (previewName) previewName.textContent = selected.name;
      preview?.classList.add('show');
    }

    uploadZone?.addEventListener('click', () => file?.click());
    uploadZone?.addEventListener('dragover', (event) => {
      event.preventDefault();
      uploadZone.classList.add('dragging');
    });
    uploadZone?.addEventListener('dragleave', () => uploadZone.classList.remove('dragging'));
    uploadZone?.addEventListener('drop', (event) => {
      event.preventDefault();
      uploadZone.classList.remove('dragging');
      if (event.dataTransfer.files.length && file) {
        const dt = new DataTransfer();
        dt.items.add(event.dataTransfer.files[0]);
        file.files = dt.files;
        updatePreview();
      }
    });
    file?.addEventListener('change', updatePreview);
    removeFile?.addEventListener('click', () => {
      if (file) file.value = '';
      updatePreview();
    });

    form?.addEventListener('submit', (event) => {
      event.preventDefault();
      const text = question.value.trim();
      if (!text) {
        showToast('Type your doubt first.');
        question.focus();
        return;
      }

      const draft = [
        subject.value ? `Subject: ${subject.value}` : '',
        level.value ? `Level: ${level.value}` : '',
        text
      ].filter(Boolean).join('\n\n');

      localStorage.setItem('tutorly_pending_doubt', draft);
      if (file?.files && file.files[0]) {
        localStorage.setItem('tutorly_pending_doubt_file', file.files[0].name);
      }
      showToast('Sending your doubt to Tutorly.');
      window.setTimeout(() => {
        window.location.href = 'maths_gpt.html?from=ask_doubt';
      }, 420);
    });
  }

  const page = document.body.dataset.tutorPage;
  if (page === 'offline') initTutorFinder('offline');
  if (page === 'online') initTutorFinder('online');
  if (page === 'ask-doubt') initAskDoubtPage();
})();
