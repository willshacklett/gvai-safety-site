"use strict";

(() => {
  const menu = document.querySelector(".menu-toggle");
  const nav = document.querySelector(".primary-nav");
  if (menu && nav) {
    menu.addEventListener("click", () => {
      const open = menu.getAttribute("aria-expanded") !== "true";
      menu.setAttribute("aria-expanded", String(open));
      nav.classList.toggle("is-open", open);
      menu.querySelector(".sr-only").textContent = open ? "Close navigation" : "Open navigation";
    });
    nav.addEventListener("click", (event) => {
      if (event.target.closest("a")) {
        menu.setAttribute("aria-expanded", "false");
        nav.classList.remove("is-open");
        menu.querySelector(".sr-only").textContent = "Open navigation";
      }
    });
  }

  document.querySelectorAll("[data-year]").forEach((node) => {
    node.textContent = String(new Date().getFullYear());
  });

  document.querySelectorAll(".service-form").forEach((form) => {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const status = form.querySelector(".form-status");
      if (!status) return;
      status.textContent = "Account service unavailable. This local frontend has no connected registration, authentication, billing, or key-issuance endpoint. Your form was not sent or saved.";
      status.focus();
    });
  });

  document.querySelectorAll("[data-show-password]").forEach((button) => {
    button.addEventListener("click", () => {
      const input = document.getElementById(button.getAttribute("aria-controls"));
      if (!input) return;
      const showing = input.type === "text";
      input.type = showing ? "password" : "text";
      button.setAttribute("aria-pressed", String(!showing));
      button.textContent = showing ? "Show" : "Hide";
    });
  });
})();

(() => {
  const demo = document.querySelector("[data-watch-demo]");
  if (!demo) return;

  const stages = [...demo.querySelectorAll(".watch-stages li")];
  const controls = demo.querySelector("[data-demo-controls]");
  const status = demo.querySelector("[data-demo-status]");
  const play = demo.querySelector("[data-demo-play]");
  const skip = demo.querySelector("[data-demo-skip]");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const stepDuration = 6000;
  let timers = [];

  function showStage(index) {
    stages.forEach((stage, number) => {
      if (number === index) stage.setAttribute("aria-current", "step");
      else stage.removeAttribute("aria-current");
    });
    return stages[index].querySelector("strong").textContent;
  }

  function finish(message) {
    timers.forEach((timer) => window.clearTimeout(timer));
    timers = [];
    showStage(stages.length - 1);
    status.textContent = message;
    play.disabled = false;
    play.textContent = reducedMotion.matches ? "Show outcome" : "Replay simulation";
    if (document.activeElement === skip) play.focus();
    skip.disabled = true;
  }

  play.addEventListener("click", () => {
    if (reducedMotion.matches) {
      finish("Simulation outcome: stop requested by a human operator.");
      return;
    }
    skip.disabled = false;
    if (document.activeElement === play) skip.focus();
    play.disabled = true;
    status.textContent = "Simulation: " + showStage(0);
    stages.slice(1).forEach((_, index) => {
      const step = index + 1;
      timers.push(window.setTimeout(() => {
        status.textContent = "Simulation: " + showStage(step);
      }, stepDuration * step));
    });
    timers.push(window.setTimeout(() => {
      finish("Simulation complete. No stop was issued to a live system.");
    }, stepDuration * stages.length));
  });

  skip.addEventListener("click", () => {
    finish("Simulation skipped to the outcome: stop requested by a human operator.");
  });

  function updateMotionPreference() {
    if (timers.length) finish("Timed playback ended. All three simulation steps are shown.");
    play.textContent = reducedMotion.matches ? "Show outcome" : "Play simulation (18 seconds)";
    status.textContent = reducedMotion.matches
      ? "Read the three steps above or show the outcome."
      : "Play the 18-second sequence or read the three steps above.";
  }

  reducedMotion.addEventListener("change", updateMotionPreference);
  updateMotionPreference();
  controls.hidden = false;
  status.hidden = false;
})();
