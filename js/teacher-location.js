(function () {
  const form = document.getElementById("teacherLocationForm");
  if (!form) return;

  if (localStorage.getItem("tutorly_account_role") !== "teacher") {
    window.location.replace("sign_up.html");
    return;
  }

  if (!localStorage.getItem("tutorly_teacher_subjects")) {
    window.location.replace("teacher_info.html");
    return;
  }

  const pinInput = document.getElementById("teacherPinCode");
  const landmarkInput = document.getElementById("teacherLandmark");
  const mapInput = document.getElementById("teacherMapLocation");
  const useLocationBtn = document.getElementById("useCurrentLocationBtn");
  const preview = document.getElementById("locationPreview");
  const hint = document.getElementById("locationHint");

  function setHint(message, type = "info") {
    hint.textContent = message || "";
    hint.dataset.type = type;
  }

  function updatePreview() {
    const value = mapInput.value.trim();
    preview.textContent = value ? `Map location: ${value}` : "No map location added yet.";
  }

  function loadSavedLocation() {
    try {
      const saved = JSON.parse(localStorage.getItem("tutorly_teacher_location_details") || "{}");
      pinInput.value = saved.pinCode || "";
      landmarkInput.value = saved.nearestLandmark || "";
      mapInput.value = saved.mapLocation || "";
      updatePreview();
    } catch (error) {
      updatePreview();
    }
  }

  function validPinCode(value) {
    return /^[0-9]{6}$/.test(value);
  }

  function normalizePinInput() {
    pinInput.value = pinInput.value.replace(/\D/g, "").slice(0, 6);
  }

  function getCurrentLocation() {
    if (!navigator.geolocation) {
      setHint("Location access is not supported here. Paste a Google Maps link manually.", "error");
      return;
    }

    useLocationBtn.disabled = true;
    useLocationBtn.textContent = "Finding...";
    setHint("Asking your browser for location permission...", "info");

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude.toFixed(6);
        const lng = position.coords.longitude.toFixed(6);
        mapInput.value = `https://www.google.com/maps?q=${lat},${lng}`;
        updatePreview();
        setHint("Location added. You can still edit it before continuing.", "success");
        useLocationBtn.disabled = false;
        useLocationBtn.textContent = "Use Current Location";
      },
      () => {
        setHint("Could not access location. Paste a map link manually.", "error");
        useLocationBtn.disabled = false;
        useLocationBtn.textContent = "Use Current Location";
      },
      {
        enableHighAccuracy: true,
        timeout: 8000,
        maximumAge: 60000
      }
    );
  }

  pinInput.addEventListener("input", normalizePinInput);
  mapInput.addEventListener("input", updatePreview);
  useLocationBtn.addEventListener("click", getCurrentLocation);

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    normalizePinInput();

    const pinCode = pinInput.value.trim();
    const nearestLandmark = landmarkInput.value.trim();
    const mapLocation = mapInput.value.trim();

    if (!validPinCode(pinCode)) {
      setHint("Please enter a valid 6-digit PIN code.", "error");
      pinInput.focus();
      return;
    }

    if (!nearestLandmark) {
      setHint("Please enter the nearest landmark.", "error");
      landmarkInput.focus();
      return;
    }

    if (!mapLocation) {
      setHint("Please add a Google Maps link or use current location.", "error");
      mapInput.focus();
      return;
    }

    localStorage.setItem("tutorly_teacher_pin_code", pinCode);
    localStorage.setItem("tutorly_teacher_nearest_landmark", nearestLandmark);
    localStorage.setItem("tutorly_teacher_map_location", mapLocation);
    localStorage.setItem("tutorly_teacher_location_status", "Submitted");
    localStorage.setItem("tutorly_teacher_location_details", JSON.stringify({
      pinCode,
      nearestLandmark,
      mapLocation,
      submittedAt: new Date().toISOString()
    }));

    window.location.href = "teacher_verification.html";
  });

  loadSavedLocation();
})();
