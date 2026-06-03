document.addEventListener('DOMContentLoaded', function () {

  // Experience: see more / see less
  var expBtn = document.getElementById('expShowAll');
  if (expBtn) {
    var extraRows = document.querySelectorAll('.exp-row--hidden, .exp-row--extra');
    // Mark hidden rows as extra so we can re-hide them
    document.querySelectorAll('.exp-row--hidden').forEach(function (el) {
      el.classList.add('exp-row--extra');
    });

    expBtn.addEventListener('click', function () {
      var expanded = expBtn.getAttribute('aria-expanded') === 'true';
      document.querySelectorAll('.exp-row--extra').forEach(function (el) {
        el.classList.toggle('exp-row--hidden', expanded);
      });
      expBtn.setAttribute('aria-expanded', String(!expanded));
      expBtn.textContent = expanded ? 'See more' : 'See less';
    });
  }

  // Projects: desc see more / tags +N
  document.querySelectorAll('.project-card').forEach(function (card) {
    // Desc see more
    var btn = card.querySelector('.proj-see-more');
    var desc = card.querySelector('.project-desc');
    if (btn && desc) {
      if (desc.scrollHeight <= desc.clientHeight) { btn.style.display = 'none'; }
      else {
        btn.addEventListener('click', function () {
          var expanded = btn.getAttribute('aria-expanded') === 'true';
          desc.classList.toggle('proj-desc--expanded', !expanded);
          btn.setAttribute('aria-expanded', String(!expanded));
          btn.textContent = expanded ? 'See more' : 'See less';
        });
      }
    }

    // Tags +N (show 2, rest hidden, toggle on click)
    var tags = Array.from(card.querySelectorAll('.project-tags li'));
    var moreBadge = card.querySelector('.proj-tags-more');
    var LIMIT = 2;
    if (moreBadge && tags.length > LIMIT) {
      var extra = tags.slice(LIMIT);
      extra.forEach(function (t) { t.classList.add('proj-tag--hidden'); });
      moreBadge.textContent = '+' + extra.length;
      moreBadge.style.display = 'inline-block';
      moreBadge.addEventListener('click', function () {
        var expanded = moreBadge.getAttribute('aria-expanded') === 'true';
        extra.forEach(function (t) { t.classList.toggle('proj-tag--hidden', expanded); });
        moreBadge.setAttribute('aria-expanded', String(!expanded));
        moreBadge.textContent = expanded ? '+' + extra.length : '–';
      });
    }
  });

  // Lightbox
  var lb = null;
  function openLightbox(src) {
    lb = document.createElement('div');
    lb.className = 'lightbox';
    lb.innerHTML = '<button class="lightbox-close" aria-label="Close"><i class="fa-solid fa-xmark"></i></button><img src="' + src + '" alt="" />';
    document.body.appendChild(lb);
    lb.addEventListener('click', function (e) {
      if (e.target === lb || e.target.closest('.lightbox-close')) closeLightbox();
    });
  }
  function closeLightbox() {
    if (lb) { lb.remove(); lb = null; }
  }
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeLightbox();
  });
  document.querySelectorAll('.ach-gallery-item').forEach(function (btn) {
    btn.addEventListener('click', function () { openLightbox(btn.dataset.src); });
  });

  // Achievements: show more toggle
  var achBtn = document.getElementById('achShowMore');
  if (achBtn) {
    var hiddenAch = Array.from(document.querySelectorAll('.ach-item--hidden'));
    achBtn.addEventListener('click', function () {
      var expanded = achBtn.getAttribute('aria-expanded') === 'true';
      hiddenAch.forEach(function (el) {
        el.style.display = expanded ? 'none' : '';
        el.classList.toggle('ach-item--hidden', expanded);
      });
      achBtn.setAttribute('aria-expanded', String(!expanded));
      achBtn.textContent = expanded ? 'See more' : 'See less';
    });
  }

  // Achievements: desc see more
  document.querySelectorAll('.ach-see-more').forEach(function (btn) {
    var desc = btn.closest('.ach-desc-wrap').querySelector('.ach-desc');
    if (desc.scrollHeight <= desc.clientHeight) { btn.style.display = 'none'; return; }
    btn.addEventListener('click', function () {
      var expanded = btn.getAttribute('aria-expanded') === 'true';
      desc.classList.toggle('ach-desc--expanded', !expanded);
      btn.setAttribute('aria-expanded', String(!expanded));
      btn.textContent = expanded ? 'See more' : 'See less';
    });
  });

  // Education: coursework see more
  document.querySelectorAll('.edu-see-more').forEach(function (btn) {
    var desc = btn.closest('.edu-desc-wrap').querySelector('.edu-desc');
    if (desc.scrollHeight <= desc.clientHeight) { btn.style.display = 'none'; return; }
    btn.addEventListener('click', function () {
      var expanded = btn.getAttribute('aria-expanded') === 'true';
      desc.classList.toggle('edu-desc--expanded', !expanded);
      btn.setAttribute('aria-expanded', String(!expanded));
      btn.textContent = expanded ? 'See more' : 'See less';
    });
  });

  // Education: activities collapse
  document.querySelectorAll('.edu-activities-toggle').forEach(function (btn) {
    var collapse = btn.nextElementSibling;
    btn.addEventListener('click', function () {
      var expanded = btn.getAttribute('aria-expanded') === 'true';
      btn.setAttribute('aria-expanded', String(!expanded));
      collapse.classList.toggle('edu-collapse--open', !expanded);
    });
  });

});

// Bottom nav
(function () {
  var nav = document.getElementById('bottomNav');
  if (!nav) return;

  var navItems = Array.from(nav.querySelectorAll('.nav-item[data-section]'));
  var sectionIds = navItems.map(function (el) { return el.dataset.section; });
  var titleEl = document.getElementById('navActiveTitle');
  var hamburger = document.getElementById('navHamburger');
  var TITLES = {
    hero: 'Home', about: 'About', experience: 'Experience',
    projects: 'Projects', achievements: 'Achievements', blog: 'Blog'
  };

  function setActive(id) {
    navItems.forEach(function (item) {
      item.classList.toggle('active', item.dataset.section === id);
    });
    if (titleEl && TITLES[id]) titleEl.textContent = TITLES[id];
  }

  /* Mobile menu popup toggle */
  function closeMenu() { nav.classList.remove('menu-open'); }
  function toggleMenu(e) {
    e.stopPropagation();
    nav.classList.toggle('menu-open');
  }
  if (hamburger) hamburger.addEventListener('click', toggleMenu);
  if (titleEl) titleEl.addEventListener('click', toggleMenu);
  document.addEventListener('click', function (e) {
    if (nav.classList.contains('menu-open') && !nav.contains(e.target)) closeMenu();
  });

  function detectActive() {
    var mid = window.scrollY + window.innerHeight * 0.45;
    var best = sectionIds[0];
    var bestDist = Infinity;
    sectionIds.forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      var dist = Math.abs(el.offsetTop - mid);
      if (dist < bestDist) { bestDist = dist; best = id; }
    });
    setActive(best);
  }

  // Detect if we're on a section-based page (homepage) or a standalone page
  var path = window.location.pathname;
  var hasSections = sectionIds.some(function (id) { return document.getElementById(id); });

  if (hasSections) {
    window.addEventListener('scroll', detectActive, { passive: true });
    detectActive();
  } else {
    // Set active based on URL path for non-homepage pages
    if (path.startsWith('/projects'))    { setActive('projects'); }
    else if (path.startsWith('/blog'))   { setActive('blog'); }
    else if (path.startsWith('/experience')) { setActive('experience'); }
  }

  var lastY = window.scrollY;
  window.addEventListener('scroll', function () {
    var y = window.scrollY;
    nav.classList.toggle('nav--hidden', y > lastY && y > 80);
    lastY = y;
  }, { passive: true });

  navItems.forEach(function (item) {
    item.addEventListener('click', function (e) {
      closeMenu();
      var id = item.dataset.section;
      var target = document.getElementById(id);
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else {
        e.preventDefault();
        window.location.href = id === 'hero' ? '/' : '/#' + id;
      }
    });
  });
})();
