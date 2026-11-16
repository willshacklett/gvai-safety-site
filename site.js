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
