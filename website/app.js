/* global document, window, HTMLElement, HTMLAnchorElement, HTMLFormElement, HTMLInputElement, HTMLSelectElement, HTMLTextAreaElement, IntersectionObserver, ResizeObserver, requestAnimationFrame, cancelAnimationFrame, performance, KeyboardEvent */
// Veloria — « Terminal d'Or » : interactions du site vitrine.
// Principes : 1) rien qui bloque le premier rendu ; 2) toute animation est
// réversible via `prefers-reduced-motion` ; 3) le défilement n'est jamais
// traité hors `requestAnimationFrame` ; 4) aucun réseau, aucun secret en
// clair côté client (l'espace admin reste un prototype local, cf. README).
document.addEventListener("DOMContentLoaded", () => {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const finePointer = window.matchMedia("(pointer: fine)");

  // ——————————————————————————————————————————————— Navigation mobile
  const navToggle = document.querySelector("[data-nav-toggle]");
  const nav = document.getElementById("main-nav");
  if (navToggle instanceof HTMLElement && nav instanceof HTMLElement) {
    navToggle.addEventListener("click", () => {
      const open = nav.classList.toggle("open");
      navToggle.setAttribute("aria-expanded", String(open));
    });
    nav.addEventListener("click", (ev) => {
      if (!(ev.target instanceof HTMLAnchorElement)) return;
      if (window.innerWidth > 960) return;
      nav.classList.remove("open");
      navToggle.setAttribute("aria-expanded", "false");
    });
  }

  // ——————————————————————————————————————————————— Progression & section suivante
  const progressBar = document.querySelector(".scroll-progress");
  const maxScroll = () => Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
  const scrollRatio = () => (maxScroll() ? Math.min(1, window.scrollY / maxScroll()) : 0);

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

  const header = document.querySelector(".site-header");
  const headerOffset = () => (header ? header.getBoundingClientRect().height + 36 : 108);
  const atBottom = () => window.scrollY >= maxScroll() - 4;
  const scrollTargets = () =>
    Array.from(document.querySelectorAll("main h2, .site-footer"))
      .filter((el) => el.getClientRects().length > 0)
      .map((el) => ({ top: el.getBoundingClientRect().top + window.scrollY - headerOffset() }))
      .sort((a, b) => a.top - b.top);
  const updateScrollDown = () => {
    const max = maxScroll();
    scrollDown.hidden = max <= 8;
    if (progressBar instanceof HTMLElement) {
      progressBar.style.setProperty("--progress", String(scrollRatio()));
    }
    if (scrollDown.hidden) return;
    const bottom = atBottom();
    const label = bottom ? "Retour en haut" : "Section suivante";
    scrollDown.classList.toggle("is-top", bottom);
    scrollDown.style.setProperty("--scroll-progress", String(scrollRatio()));
    const labelEl = scrollDown.querySelector(".scroll-down-label");
    if (labelEl) labelEl.textContent = label;
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
      revealVisible();
    });
  };
  document.addEventListener("scroll", scheduleScrollUpdate, { passive: true });
  window.addEventListener("resize", scheduleScrollUpdate);
  window.addEventListener("load", scheduleScrollUpdate);
  if ("ResizeObserver" in window) new ResizeObserver(scheduleScrollUpdate).observe(document.body);
  updateScrollDown();

  // ——————————————————————————————————————————————— Révélation au défilement
  // Balayage déterministe (et non IntersectionObserver) : le contrôle est
  // fait dans la boucle rAF du défilement, donc il fonctionne aussi bien en
  // capture pleine page, en onglet en arrière-plan, ou avec un défilement
  // instantané (le IO pouvait ne jamais déclencher : blocs restés invisibles).
  const reveals = Array.from(document.querySelectorAll("[data-reveal]"));
  reveals.forEach((el, i) => {
    if (el instanceof HTMLElement) {
      el.style.transitionDelay = `${Math.min(i % 4, 3) * 70}ms`;
    }
  });
  const revealVisible = () => {
    const vh = window.innerHeight;
    for (const el of reveals) {
      if (el.classList.contains("in")) continue;
      const r = el.getBoundingClientRect();
      if (r.top < vh * 0.92 && r.bottom > 0) el.classList.add("in");
    }
  };
  // Filet de sécurité : rien ne reste caché durablement, même si la page
  // n'est jamais défilée (information jamais cachée par défaut).
  window.setTimeout(() => {
    reveals.forEach((el) => el.classList.add("in"));
  }, 1400);
  revealVisible();

  // ——————————————————————————————————————————————— Mot qui défile (héros)
  const rotator = document.querySelector("[data-rotator]");
  if (rotator instanceof HTMLElement && !reduceMotion.matches) {
    const words = Array.from(rotator.querySelectorAll("span"));
    if (words.length > 1) {
      let index = 0;
      words[0].classList.add("is-on");
      const timer = setInterval(() => {
        words[index].classList.remove("is-on");
        index = (index + 1) % words.length;
        words[index].classList.add("is-on");
      }, 2600);
      window.addEventListener("pagehide", () => clearInterval(timer), { once: true });
    }
  }

  // ——————————————————————————————————————————————— Compteurs animés
  const animateNumber = (el) => {
    const target = Number(el.dataset.count);
    if (!Number.isFinite(target)) return;
    const decimals = (el.dataset.countDecimals || "0").length;
    const duration = 1100;
    const start = performance.now();
    const step = (now) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = (target * eased).toFixed(decimals);
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };
  const counters = document.querySelectorAll("[data-count]");
  if (counters.length > 0) {
    if ("IntersectionObserver" in window && !reduceMotion.matches) {
      const cio = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            animateNumber(entry.target);
            cio.unobserve(entry.target);
          });
        },
        { threshold: 0.5 },
      );
      counters.forEach((el) => cio.observe(el));
    } else {
      counters.forEach((el) => {
        const decimals = (el.dataset.countDecimals || "0").length;
        const target = Number(el.dataset.count);
        if (Number.isFinite(target)) el.textContent = target.toFixed(decimals);
      });
    }
  }

  // ——————————————————————————————————————————————— Onglets produit (tablist)
  document.querySelectorAll("[data-tabs]").forEach((tabsRoot) => {
    if (!(tabsRoot instanceof HTMLElement)) return;
    const buttons = Array.from(tabsRoot.querySelectorAll("[role=tab]"));
    const panel = document.querySelector(tabsRoot.dataset.tabs || "");
    if (buttons.length === 0 || !(panel instanceof HTMLElement)) return;
    const show = (index) => {
      buttons.forEach((btn, i) => {
        if (!(btn instanceof HTMLElement)) return;
        btn.setAttribute("aria-selected", String(i === index));
        btn.tabIndex = i === index ? 0 : -1;
      });
      const src = buttons[index]?.getAttribute("data-src");
      panel.querySelectorAll("img").forEach((img) => {
        img.classList.toggle("is-on", img.getAttribute("src") === src);
      });
    };
    buttons.forEach((btn, i) => {
      btn.addEventListener("click", () => show(i));
      btn.addEventListener("keydown", (ev) => {
        if (!(ev instanceof KeyboardEvent)) return;
        const delta = ev.key === "ArrowRight" ? 1 : ev.key === "ArrowLeft" ? -1 : 0;
        if (delta === 0) return;
        ev.preventDefault();
        const next = (i + delta + buttons.length) % buttons.length;
        const target = buttons[next];
        if (target instanceof HTMLElement) target.focus();
        show(next);
      });
    });
    show(0);
  });

  // ——————————————————————————————————————————————— Chapitres (scrollytelling)
  const chapters = Array.from(document.querySelectorAll("[data-chapter]"));
  if (chapters.length > 0) {
    const frame = document.querySelector("[data-chapter-frame]");
    const caption = document.querySelector("[data-chapter-caption]");
    const frameImages = frame ? Array.from(frame.querySelectorAll("img")) : [];
    const activate = (chapter) => {
      chapters.forEach((c) => c.classList.toggle("is-active", c === chapter));
      const src = chapter.getAttribute("data-chapter");
      frameImages.forEach((img) => {
        img.classList.toggle("is-on", img.getAttribute("src") === src);
      });
      if (caption instanceof HTMLElement) {
        caption.textContent = chapter.getAttribute("data-chapter-label") || "";
      }
    };
    if ("IntersectionObserver" in window) {
      const cio = new IntersectionObserver(
        (entries) => {
          const visible = entries
            .filter((e) => e.isIntersecting)
            .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
          if (visible) activate(visible.target);
        },
        { threshold: [0.25, 0.5, 0.75], rootMargin: "-18% 0px -35% 0px" },
      );
      chapters.forEach((c) => cio.observe(c));
    }
    activate(chapters[0]);
  }

  // ——————————————————————————————————————————————— Inclinaison 3D (souris fine)
  if (finePointer.matches && !reduceMotion.matches) {
    document.querySelectorAll(".app-frame, .phone").forEach((el) => {
      if (!(el instanceof HTMLElement)) return;
      let raf = null;
      el.addEventListener("mousemove", (ev) => {
        const r = el.getBoundingClientRect();
        const x = (ev.clientX - r.left) / r.width - 0.5;
        const y = (ev.clientY - r.top) / r.height - 0.5;
        if (raf) cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => {
          el.style.transform = `rotateY(${x * 5}deg) rotateX(${-y * 5}deg)`;
        });
      });
      el.addEventListener("mouseleave", () => {
        if (raf) cancelAnimationFrame(raf);
        el.style.transform = "";
      });
    });
  }

  // ——————————————————————————————————————————————— Projecteur (cartes)
  document.querySelectorAll(".bento .card, .testi, .chapter").forEach((card) => {
    if (!(card instanceof HTMLElement)) return;
    card.addEventListener("mousemove", (ev) => {
      const r = card.getBoundingClientRect();
      card.style.setProperty("--mx", `${((ev.clientX - r.left) / r.width) * 100}%`);
      card.style.setProperty("--my", `${((ev.clientY - r.top) / r.height) * 100}%`);
    });
  });

  // ——————————————————————————————————————————————— Boutons magnétiques
  if (finePointer.matches && !reduceMotion.matches) {
    document.querySelectorAll(".btn-primary").forEach((btn) => {
      if (!(btn instanceof HTMLElement)) return;
      btn.addEventListener("mousemove", (ev) => {
        const r = btn.getBoundingClientRect();
        const dx = (ev.clientX - (r.left + r.width / 2)) * 0.18;
        const dy = (ev.clientY - (r.top + r.height / 2)) * 0.24;
        btn.style.transform = `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px)`;
      });
      btn.addEventListener("mouseleave", () => {
        btn.style.transform = "";
      });
    });
  }

  // ——————————————————————————————————————————————— Formulaire de contact
  const form = document.querySelector("[data-contact-form]");
  const err = document.querySelector("[data-form-error]");
  if (form instanceof HTMLFormElement) {
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
