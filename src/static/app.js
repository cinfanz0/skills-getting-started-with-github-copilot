document.addEventListener("DOMContentLoaded", () => {
  const activitiesList = document.getElementById("activities-list");
  const activitySelect = document.getElementById("activity");
  const signupForm = document.getElementById("signup-form");
  const messageDiv = document.getElementById("message");

  // Helper: presentable name from email (e.g. "jane.doe@..." -> "Jane Doe")
  function formatParticipant(email) {
    const name = String(email).split("@")[0].replace(/\./g, " ");
    return name
      .split(" ")
      .filter(Boolean)
      .map(s => s[0].toUpperCase() + s.slice(1))
      .join(" ");
  }

  // Helper: initials for avatar
  function initialsFromEmail(email) {
    return formatParticipant(email)
      .split(" ")
      .map(s => s[0])
      .slice(0, 2)
      .join("")
      .toUpperCase();
  }

  // Minimal escape to avoid injecting HTML from data
  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  // Function to fetch activities from API
  async function fetchActivities() {
    try {
      const response = await fetch("/activities", { cache: "no-store" });
      const activities = await response.json();

      // Clear loading message
      activitiesList.innerHTML = "";

      // Reset activity select (keep default placeholder)
      activitySelect.innerHTML = '<option value="">-- Select an activity --</option>';

      // Populate activities list
      Object.entries(activities).forEach(([name, details]) => {
        const activityCard = document.createElement("div");
        activityCard.className = "activity-card";

        const participants = Array.isArray(details.participants) ? details.participants : [];
        const spotsLeft = details.max_participants - participants.length;

        // Build participants HTML (show up to 5, then "+N more")
        let participantsHtml = "";
        if (participants.length === 0) {
          participantsHtml = `<p class="no-participants">No participants yet — be the first!</p>`;
        } else {
          const visible = participants.slice(0, 5);
          const more = participants.length - visible.length;
          participantsHtml = `<ul class="participants-list" aria-label="Participants for ${escapeHtml(
            name
          )}">` + visible.map(p => `
              <li class="participant-item">
                <span class="avatar" aria-hidden="true">${escapeHtml(initialsFromEmail(p))}</span>
                <span class="participant-name">${escapeHtml(formatParticipant(p))}</span>
                <button type="button" class="participant-remove" data-activity="${escapeHtml(name)}" data-email="${escapeHtml(p)}" aria-label="Remove ${escapeHtml(formatParticipant(p))}">
                  <span aria-hidden="true">✕</span>
                  <span class="sr-only">Remove ${escapeHtml(formatParticipant(p))}</span>
                </button>
              </li>
            `).join("") + (more > 0 ? `<li class="participant-more">+${more} more</li>` : "") + `</ul>`;
        }

        activityCard.innerHTML = `
          <h4>${escapeHtml(name)}</h4>
          <p>${escapeHtml(details.description)}</p>
          <p><strong>Schedule:</strong> ${escapeHtml(details.schedule)}</p>
          <p><strong>Availability:</strong> ${spotsLeft} spots left</p>

          <div class="participants">
            <h5>Participants</h5>
            ${participantsHtml}
          </div>
        `;

        activitiesList.appendChild(activityCard);

        // Add option to select dropdown
        const option = document.createElement("option");
        option.value = name;
        option.textContent = name;
        activitySelect.appendChild(option);
      });
    } catch (error) {
      activitiesList.innerHTML = "<p>Failed to load activities. Please try again later.</p>";
      console.error("Error fetching activities:", error);
    }
  }

  // Handle form submission
  signupForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const email = document.getElementById("email").value;
    const activity = document.getElementById("activity").value;

    try {
      const response = await fetch(
        `/activities/${encodeURIComponent(activity)}/signup?email=${encodeURIComponent(email)}`,
        {
          method: "POST",
        }
      );

      const result = await response.json();

      if (response.ok) {
        messageDiv.textContent = result.message;
        messageDiv.className = "success";
        signupForm.reset();

        // Optimistically update the UI so the new participant appears immediately
        try {
          const activityCard = Array.from(activitiesList.querySelectorAll('.activity-card')).find(card => {
            const h4 = card.querySelector('h4');
            return h4 && h4.textContent === activity;
          });

          if (activityCard) {
            const list = activityCard.querySelector('.participants-list');
            const li = document.createElement('li');
            li.className = 'participant-item';
            li.innerHTML = `
              <span class="avatar" aria-hidden="true">${escapeHtml(initialsFromEmail(email))}</span>
              <span class="participant-name">${escapeHtml(formatParticipant(email))}</span>
              <button type="button" class="participant-remove" data-activity="${escapeHtml(activity)}" data-email="${escapeHtml(email)}" aria-label="Remove ${escapeHtml(formatParticipant(email))}">
                <span aria-hidden="true">✕</span>
                <span class="sr-only">Remove ${escapeHtml(formatParticipant(email))}</span>
              </button>
            `;

            if (list) {
              const more = list.querySelector('.participant-more');
              if (more) list.insertBefore(li, more);
              else list.appendChild(li);
            } else {
              const participantsDiv = activityCard.querySelector('.participants');
              const ul = document.createElement('ul');
              ul.className = 'participants-list';
              ul.setAttribute('aria-label', `Participants for ${activity}`);
              ul.appendChild(li);
              const no = participantsDiv.querySelector('.no-participants');
              if (no) no.remove();
              participantsDiv.appendChild(ul);
            }
          }
        } catch (err) {
          // non-fatal — we'll refresh the canonical view below
          console.warn('Optimistic UI update failed', err);
        }

        // Refresh the activities to reconcile with server (non-blocking)
        fetchActivities();
      } else {
        messageDiv.textContent = result.detail || "An error occurred";
        messageDiv.className = "error";
      }

      messageDiv.classList.remove("hidden");

      // Hide message after 5 seconds
      setTimeout(() => {
        messageDiv.classList.add("hidden");
      }, 5000);
    } catch (error) {
      messageDiv.textContent = "Failed to sign up. Please try again.";
      messageDiv.className = "error";
      messageDiv.classList.remove("hidden");
      console.error("Error signing up:", error);
    }
  });

  // Event delegation for participant remove buttons
  activitiesList.addEventListener("click", async (event) => {
    const btn = event.target.closest && event.target.closest(".participant-remove");
    if (!btn) return;

    const email = btn.dataset.email;
    const activity = btn.dataset.activity;

    if (!email || !activity) return;

    // Call unregister endpoint
    try {
      const res = await fetch(`/activities/${encodeURIComponent(activity)}/unregister?email=${encodeURIComponent(email)}`,
        { method: "POST" }
      );

      const payload = await res.json();

      if (res.ok) {
        messageDiv.textContent = payload.message || "Participant removed";
        messageDiv.className = "success";
        messageDiv.classList.remove("hidden");

        // Refresh list to reflect changes
        fetchActivities();
      } else {
        messageDiv.textContent = payload.detail || "Failed to remove participant";
        messageDiv.className = "error";
        messageDiv.classList.remove("hidden");
      }

      setTimeout(() => messageDiv.classList.add("hidden"), 4000);
    } catch (err) {
      console.error("Error removing participant:", err);
      messageDiv.textContent = "Failed to remove participant. Please try again.";
      messageDiv.className = "error";
      messageDiv.classList.remove("hidden");
      setTimeout(() => messageDiv.classList.add("hidden"), 4000);
    }
  });

  // Initialize app
  fetchActivities();
});
