/* global document, window, HTMLAnchorElement, HTMLFormElement, HTMLInputElement, HTMLSelectElement, HTMLTextAreaElement, IntersectionObserver, ResizeObserver, requestAnimationFrame, cancelAnimationFrame */
// Veloria 2026 : navigation mobile + tilt 3D + scroll reveal + spotlight + formulaire + admin
document.addEventListener("DOMContentLoaded", () => {
  const btn = document.querySelector("[data-nav-toggle]");
  const nav = document.getElementById("main-nav");
  if (btn && nav) {
    btn.addEventListener("click", () => {
      const open = nav.classList.toggle("open");
      btn.setAttribute("aria-expanded", String(open));
    });
  }

  // ——— Scroll down : section suivante, progression, retour en haut ———
  const scrollDown = document.createElement("button");
  scrollDown.type = "button";
  scrollDown.className = "scroll-down";
  scrollDown.dataset.scrollDown = "";
  scrollDown.hidden = true;
  scrollDown.innerHTML = `
    <svg class="scroll-down-chevrons" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
      <path d="m7 6 5 5 5-5M7 13l5 5 5-5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
    <span class="scroll-down-label">Section suivante</span>
    <span class="scroll-down-progress" aria-hidden="true"></span>
  `;
  document.body.appendChild(scrollDown);

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const header = document.querySelector(".site-header");
  const headerOffset = () => (header ? header.getBoundingClientRect().height + 32 : 104);
  const maxScroll = () => Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
  const atBottom = () => window.scrollY >= maxScroll() - 4;
  const scrollTargets = () =>
    Array.from(document.querySelectorAll("main h2, .site-footer"))
      .filter((el) => el.getClientRects().length > 0)
      .map((el) => ({ top: el.getBoundingClientRect().top + window.scrollY - headerOffset() }))
      .sort((a, b) => a.top - b.top);
  const updateScrollDown = () => {
    const max = maxScroll();
    scrollDown.hidden = max <= 8;
    if (scrollDown.hidden) return;
    const bottom = atBottom();
    const label = bottom ? "Retour en haut" : "Section suivante";
    scrollDown.classList.toggle("is-top", bottom);
    scrollDown.style.setProperty(
      "--scroll-progress",
      String(max ? Math.min(1, window.scrollY / max) : 0),
    );
    scrollDown.querySelector(".scroll-down-label").textContent = label;
    scrollDown.setAttribute(
      "aria-label",
      bottom ? "Retour en haut de la page" : "Défiler vers la section suivante",
    );
    scrollDown.title = label;
  };
  scrollDown.addEventListener("click", () => {
    const behavior = reduceMotion.matches ? "auto" : "smooth";
    if (atBottom()) {
      window.scrollTo({ top: 0, behavior });
      return;
    }
    const next = scrollTargets().find((target) => target.top > window.scrollY + 4);
    window.scrollTo({ top: next ? next.top : maxScroll(), behavior });
  });
  let scrollTicking = false;
  const scheduleScrollUpdate = () => {
    if (scrollTicking) return;
    scrollTicking = true;
    requestAnimationFrame(() => {
      scrollTicking = false;
      updateScrollDown();
    });
  };
  document.addEventListener("scroll", scheduleScrollUpdate, { passive: true });
  window.addEventListener("resize", scheduleScrollUpdate);
  window.addEventListener("load", scheduleScrollUpdate);
  if ("ResizeObserver" in window) new ResizeObserver(scheduleScrollUpdate).observe(document.body);
  updateScrollDown();

  // ——— Scroll reveal (cinematic scrollytelling, stagger leger) ———
  const reveals = document.querySelectorAll("[data-reveal]");
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.12 },
    );
    reveals.forEach((el, i) => {
      el.style.transitionDelay = `${Math.min(i % 4, 3) * 70}ms`;
      io.observe(el);
    });
  } else {
    reveals.forEach((el) => el.classList.add("in"));
  }

  // ——— Tilt 3D (un seul moment wow, physics-based) ———
  const tilts = document.querySelectorAll(".device, .phone");
  const finePointer = window.matchMedia?.("(pointer:fine)").matches;
  if (finePointer) {
    tilts.forEach((el) => {
      let raf = null;
      const onMove = (ev) => {
        const r = el.getBoundingClientRect();
        const x = (ev.clientX - r.left) / r.width - 0.5;
        const y = (ev.clientY - r.top) / r.height - 0.5;
        if (raf) cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => {
          el.style.transform = `rotateY(${x * 8}deg) rotateX(${-y * 8}deg) translateZ(0)`;
        });
      };
      const onLeave = () => {
        if (raf) cancelAnimationFrame(raf);
        el.style.transform = "rotateY(0deg) rotateX(0deg)";
      };
      el.addEventListener("mousemove", onMove);
      el.addEventListener("mouseleave", onLeave);
    });
  }

  // ——— Spotlight bento (position du curseur en CSS vars) ———
  document.querySelectorAll(".bento .card, .testi").forEach((card) => {
    card.addEventListener("mousemove", (ev) => {
      const r = card.getBoundingClientRect();
      card.style.setProperty("--mx", `${((ev.clientX - r.left) / r.width) * 100}%`);
      card.style.setProperty("--my", `${((ev.clientY - r.top) / r.height) * 100}%`);
    });
  });

  const form = document.querySelector("[data-contact-form]");
  const err = document.querySelector("[data-form-error]");
  if (form && form instanceof HTMLFormElement) {
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const name = form.elements.namedItem("name");
      const email = form.elements.namedItem("email");
      const topic = form.elements.namedItem("topic");
      const message = form.elements.namedItem("message");
      const show = (msg) => {
        if (err) {
          err.textContent = msg;
          err.hidden = false;
        }
      };
      if (err) err.hidden = true;
      if (!(name instanceof HTMLInputElement) || name.value.trim() === "")
        return show("Veuillez saisir votre nom.");
      if (!(email instanceof HTMLInputElement) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value))
        return show("Veuillez saisir un e-mail valide.");
      if (!(topic instanceof HTMLSelectElement) || topic.value === "")
        return show("Veuillez choisir un sujet.");
      if (!(message instanceof HTMLTextAreaElement) || message.value.trim() === "")
        return show("Veuillez ecrire votre message.");
      const entry = {
        name: name.value,
        email: email.value,
        topic: topic.value,
        message: message.value,
        at: new Date().toISOString(),
      };
      try {
        const inbox = JSON.parse(window.localStorage.getItem("veloria:inbox") ?? "[]");
        inbox.unshift(entry);
        window.localStorage.setItem("veloria:inbox", JSON.stringify(inbox.slice(0, 100)));
      } catch {
        /* stockage local indisponible: mailto reste le canal principal */
      }
      const subject = encodeURIComponent(`Veloria — ${topic.value} (${name.value})`);
      const body = encodeURIComponent(`${message.value}\n\n— ${name.value} <${email.value}>`);
      window.location.href = `mailto:zenaguibilal2@gmail.com?subject=${subject}&body=${body}`;
    });
  }

  // —— Liens de telechargement geres par l'admin (localStorage) ——
  try {
    const links = JSON.parse(window.localStorage.getItem("veloria:links") ?? "{}");
    document.querySelectorAll("[data-download]").forEach((a) => {
      if (a instanceof HTMLAnchorElement) {
        const key = a.getAttribute("data-download");
        if (key && links[key]) a.href = links[key];
      }
    });
  } catch {
    /* ignore */
  }

  // —— Espace admin secret (admin.html) ——
  const ADMIN_CODE = "veloria-admin";
  const gate = document.getElementById("gate");
  const panel = document.getElementById("panel");
  if (gate && panel) {
    const unlock = document.getElementById("unlock");
    const code = document.getElementById("code");
    const gateError = document.getElementById("gate-error");
    const lock = document.getElementById("lock");
    const open = () => {
      gate.hidden = true;
      panel.hidden = false;
      try {
        const inbox = JSON.parse(window.localStorage.getItem("veloria:inbox") ?? "[]");
        const box = document.getElementById("messages");
        if (box) {
          box.innerHTML = inbox.length
            ? inbox
                .map(() => `<article><strong></strong><div class="muted"></div><p></p></article>`)
                .join("")
            : "<p class='muted'>Aucun message reçu sur ce navigateur.</p>";
          box.querySelectorAll("article").forEach((el, i) => {
            const m = inbox[i];
            el.querySelector("strong").textContent = `${m.name} — ${m.topic}`;
            el.querySelector(".muted").textContent = `${m.email} · ${m.at}`;
            el.querySelector("p").textContent = m.message;
          });
        }
        const links = JSON.parse(window.localStorage.getItem("veloria:links") ?? "{}");
        const pos = document.getElementById("pos-link");
        const cli = document.getElementById("client-link");
        const wa = document.getElementById("wa-link");
        if (pos instanceof HTMLInputElement && links.pos) pos.value = links.pos;
        if (cli instanceof HTMLInputElement && links.client) cli.value = links.client;
        if (wa instanceof HTMLInputElement && links.wa) wa.value = links.wa;
      } catch {
        /* ignore */
      }
    };
    if (unlock)
      unlock.addEventListener("click", () => {
        if (code instanceof HTMLInputElement && code.value === ADMIN_CODE) open();
        else if (gateError) gateError.hidden = false;
      });
    if (lock)
      lock.addEventListener("click", () => {
        gate.hidden = false;
        panel.hidden = true;
      });
    const linksForm = document.getElementById("links-form");
    if (linksForm instanceof HTMLFormElement) {
      linksForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const pos = document.getElementById("pos-link");
        const cli = document.getElementById("client-link");
        const wa = document.getElementById("wa-link");
        const links = {
          pos: pos instanceof HTMLInputElement ? pos.value.trim() : "",
          client: cli instanceof HTMLInputElement ? cli.value.trim() : "",
          wa: wa instanceof HTMLInputElement ? wa.value.trim() : "",
        };
        try {
          window.localStorage.setItem("veloria:links", JSON.stringify(links));
        } catch {
          /* ignore */
        }
        window.alert("Liens enregistrés.");
      });
    }
  }
});
