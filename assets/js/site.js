/*
 * L’Adresse Estagnots — comportements de la page.
 * Amélioration progressive : sans ce script, le contenu, les images, la galerie (liens
 * vers les photos) et les liens de réservation restent utilisables.
 */
(function () {
  'use strict';

  var root = document.documentElement;
  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  var header = document.querySelector('[data-header]');

  function onChange(mq, handler) {
    if (mq.addEventListener) mq.addEventListener('change', handler);
    else if (mq.addListener) mq.addListener(handler);
  }

  function motionAllowed() {
    return !reducedMotion.matches;
  }

  function syncMotionClass() {
    root.classList.toggle('motion-ok', motionAllowed());
  }

  function headerHeight() {
    return header ? header.getBoundingClientRect().height : 0;
  }

  function clamp01(value) {
    return value < 0 ? 0 : value > 1 ? 1 : value;
  }

  function segment(progress, start, end) {
    return clamp01((progress - start) / (end - start));
  }

  function easeInOut(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  syncMotionClass();
  onChange(reducedMotion, syncMotionClass);

  /* ------------------------------------------------------------------------
     Menu mobile
     ------------------------------------------------------------------------ */
  (function initMenu() {
    var toggle = document.querySelector('[data-menu-toggle]');
    var nav = document.querySelector('[data-nav]');
    if (!toggle || !nav || !header) return;

    function setOpen(open, restoreFocus) {
      header.classList.toggle('is-open', open);
      toggle.setAttribute('aria-expanded', String(open));
      toggle.querySelector('.menu-toggle__label').textContent = open ? 'Fermer' : 'Menu';
      if (open) {
        var first = nav.querySelector('a');
        if (first) first.focus();
      } else if (restoreFocus) {
        toggle.focus();
      }
    }

    toggle.addEventListener('click', function () {
      setOpen(toggle.getAttribute('aria-expanded') !== 'true', false);
    });

    nav.addEventListener('click', function (event) {
      if (event.target.closest('a')) setOpen(false, false);
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && header.classList.contains('is-open')) setOpen(false, true);
    });

    document.addEventListener('click', function (event) {
      if (header.classList.contains('is-open') && !header.contains(event.target)) setOpen(false, false);
    });

    onChange(window.matchMedia('(min-width: 900px)'), function (mq) {
      if (mq.matches) setOpen(false, false);
    });
  })();

  /* ------------------------------------------------------------------------
     Raccord séjour → terrasse (ordinateur, mouvement accepté)
     Avec des photos : léger rapprochement vers la baie puis fondu.
     Avec un clip adapté (video[data-scrub]) : le défilement fait avancer le plan.
     ------------------------------------------------------------------------ */
  (function initPassage() {
    var passage = document.querySelector('[data-passage]');
    if (!passage) return;

    var stage = passage.querySelector('.passage__stage');
    var clip = passage.querySelector('video[data-scrub]');
    var enabledQuery = window.matchMedia(
      '(min-width: 900px) and (min-height: 540px) and (prefers-reduced-motion: no-preference)'
    );
    var enabled = false;
    var ticking = false;
    var clipReady = false;

    function dropClip() {
      clipReady = false;
      passage.classList.remove('has-clip');
      if (clip) clip.remove();
      clip = null;
      requestUpdate();
    }

    // Le clip court est chargé en entier (Blob) : il devient entièrement « déplaçable »
    // au défilement, quel que soit le serveur, et le raccord reste fluide.
    function loadClip() {
      if (!clip || clip.dataset.loading || !clip.dataset.src || !window.fetch || !window.URL) return;
      clip.dataset.loading = 'true';
      fetch(clip.dataset.src)
        .then(function (response) {
          if (!response.ok) throw new Error('HTTP ' + response.status);
          return response.blob();
        })
        .then(function (blob) {
          if (!clip) return;
          clip.src = URL.createObjectURL(blob);
          clip.load();
        })
        .catch(dropClip);
    }

    if (clip) {
      clip.muted = true;
      clip.addEventListener('loadeddata', function () {
        clipReady = true;
        passage.classList.add('has-clip');
        requestUpdate();
      });
      clip.addEventListener('error', dropClip, true);
    }

    function update() {
      ticking = false;
      if (!enabled) return;
      var rect = passage.getBoundingClientRect();
      var distance = rect.height - stage.offsetHeight;
      var progress = distance > 0 ? clamp01((headerHeight() - rect.top) / distance) : 0;

      var heroOut = easeInOut(segment(progress, 0.02, 0.3));
      var zoom = easeInOut(segment(progress, 0, 0.72));
      var terraceIn = easeInOut(segment(progress, 0.42, 0.72));
      var captionIn = easeInOut(segment(progress, 0.7, 0.88));

      if (clip && clipReady && clip.duration) {
        // Le clip couvre la traversée ; la photo de terrasse prend le relais à la fin.
        var target = segment(progress, 0.05, 0.75) * (clip.duration - 0.05);
        if (Math.abs(clip.currentTime - target) > 0.03) clip.currentTime = target;
        zoom = 0;
        terraceIn = easeInOut(segment(progress, 0.72, 0.86));
      }

      passage.style.setProperty('--h-out', heroOut.toFixed(4));
      passage.style.setProperty('--zoom', zoom.toFixed(4));
      passage.style.setProperty('--t-in', terraceIn.toFixed(4));
      passage.style.setProperty('--c-in', captionIn.toFixed(4));
      passage.style.setProperty('--wash', (1 - Math.abs(2 * terraceIn - 1)).toFixed(4));
      passage.classList.toggle('is-hero-gone', heroOut > 0.995);
      passage.classList.toggle('is-terrace-shown', terraceIn > 0.001);
    }

    function requestUpdate() {
      if (!ticking) {
        ticking = true;
        window.requestAnimationFrame(update);
      }
    }

    function enable() {
      if (enabled) return;
      enabled = true;
      passage.classList.add('is-pinned');
      loadClip();
      window.addEventListener('scroll', requestUpdate, { passive: true });
      window.addEventListener('resize', requestUpdate);
      update();
    }

    function disable() {
      if (!enabled) return;
      enabled = false;
      passage.classList.remove('is-pinned', 'is-hero-gone', 'is-terrace-shown');
      ['--h-out', '--zoom', '--t-in', '--c-in', '--wash'].forEach(function (name) {
        passage.style.removeProperty(name);
      });
      window.removeEventListener('scroll', requestUpdate);
      window.removeEventListener('resize', requestUpdate);
    }

    function apply() {
      if (enabledQuery.matches) enable();
      else disable();
    }

    onChange(enabledQuery, apply);
    apply();

    // Le changement de hauteur de la visite décale les ancres : rejoindre la cible demandée.
    if (enabled && window.location.hash.length > 1) {
      var target = document.getElementById(decodeURIComponent(window.location.hash.slice(1)));
      if (target) {
        window.requestAnimationFrame(function () {
          target.scrollIntoView({ block: 'start' });
        });
      }
    }
  })();

  /* ------------------------------------------------------------------------
     Image de scène introuvable : garder l’aperçu flou, les légendes et le texte
     plutôt que l’icône d’image cassée.
     ------------------------------------------------------------------------ */
  document.querySelectorAll('.scene__media img, .dehors__fig img, .logement__fig img').forEach(function (img) {
    function markMissing() {
      img.classList.add('is-missing');
    }
    if (img.complete && img.naturalWidth === 0 && img.currentSrc) markMissing();
    else img.addEventListener('error', markMissing);
  });

  /* ------------------------------------------------------------------------
     Apparitions au défilement
     ------------------------------------------------------------------------ */
  (function initReveal() {
    var elements = document.querySelectorAll('.reveal, .reveal-media, .horizon');
    if (!elements.length) return;

    if (!('IntersectionObserver' in window)) {
      elements.forEach(function (el) {
        el.classList.add('is-visible');
      });
      return;
    }

    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { rootMargin: '0px 0px -10% 0px', threshold: 0.08 }
    );

    elements.forEach(function (el) {
      observer.observe(el);
    });
  })();

  /* ------------------------------------------------------------------------
     « Passer la visite » reste à portée pendant la promenade
     ------------------------------------------------------------------------ */
  (function initSkipTour() {
    var chip = document.querySelector('[data-skip-tour]');
    var tour = document.getElementById('visite');
    if (!chip || !tour) return;

    chip.hidden = false;
    var ticking = false;

    function update() {
      ticking = false;
      var rect = tour.getBoundingClientRect();
      var vh = window.innerHeight;
      var visible = rect.top < -vh * 0.5 && rect.bottom > vh * 0.9;
      chip.classList.toggle('is-visible', visible);
    }

    window.addEventListener('scroll', function () {
      if (!ticking) {
        ticking = true;
        window.requestAnimationFrame(update);
      }
    }, { passive: true });
    update();
  })();

  /* ------------------------------------------------------------------------
     Galerie : visionneuse accessible (clavier, tactile)
     ------------------------------------------------------------------------ */
  (function initLightbox() {
    var dialog = document.querySelector('[data-lightbox]');
    var items = Array.prototype.slice.call(document.querySelectorAll('[data-gallery-item]'));
    if (!dialog || !items.length || typeof dialog.showModal !== 'function') return;

    var image = dialog.querySelector('[data-lightbox-img]');
    var caption = dialog.querySelector('[data-lightbox-caption]');
    var count = dialog.querySelector('[data-lightbox-count]');
    var closeButton = dialog.querySelector('[data-lightbox-close]');
    var current = 0;
    var opener = null;
    var pointerStart = null;

    function preload(index) {
      var item = items[(index + items.length) % items.length];
      var img = new Image();
      img.sizes = '100vw';
      img.srcset = item.dataset.srcset;
    }

    function show(index) {
      current = (index + items.length) % items.length;
      var item = items[current];
      var thumb = item.querySelector('img');
      image.removeAttribute('srcset');
      image.src = item.getAttribute('href');
      image.srcset = item.dataset.srcset;
      image.sizes = '(min-width: 900px) calc(100vw - 14rem), 100vw';
      image.alt = thumb.alt;
      caption.textContent = item.querySelector('.gallery__caption').textContent;
      count.textContent = current + 1 + ' / ' + items.length;
      preload(current + 1);
      preload(current - 1);
    }

    function open(index, trigger) {
      opener = trigger;
      show(index);
      dialog.showModal();
      root.classList.add('has-dialog');
      closeButton.focus();
    }

    items.forEach(function (item, index) {
      item.addEventListener('click', function (event) {
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        open(index, item);
      });
    });

    dialog.querySelector('[data-lightbox-prev]').addEventListener('click', function () {
      show(current - 1);
    });
    dialog.querySelector('[data-lightbox-next]').addEventListener('click', function () {
      show(current + 1);
    });
    closeButton.addEventListener('click', function () {
      dialog.close();
    });

    dialog.addEventListener('keydown', function (event) {
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        show(current - 1);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        show(current + 1);
      }
    });

    // Un clic en dehors de la photo et des boutons ferme la visionneuse.
    dialog.addEventListener('click', function (event) {
      if (event.target === dialog || event.target.classList.contains('lightbox__figure')) dialog.close();
    });

    dialog.addEventListener('close', function () {
      root.classList.remove('has-dialog');
      if (opener) opener.focus();
    });

    // Balayage horizontal sur écran tactile.
    dialog.addEventListener('pointerdown', function (event) {
      if (event.pointerType === 'mouse') return;
      pointerStart = { x: event.clientX, y: event.clientY };
    });
    dialog.addEventListener('pointerup', function (event) {
      if (!pointerStart) return;
      var dx = event.clientX - pointerStart.x;
      var dy = event.clientY - pointerStart.y;
      pointerStart = null;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) show(current + (dx < 0 ? 1 : -1));
    });
    dialog.addEventListener('pointercancel', function () {
      pointerStart = null;
    });
  })();

  /* ------------------------------------------------------------------------
     Clips d’ambiance : muets, avec image d’attente, pause, chargement différé.
     Structure attendue : voir docs/MEDIAS_ATTENDUS.md.
     ------------------------------------------------------------------------ */
  (function initAmbientVideos() {
    var figures = document.querySelectorAll('[data-ambient]');
    if (!figures.length) return;

    var saveData = !!(navigator.connection && navigator.connection.saveData);
    var small = window.matchMedia('(max-width: 899px)').matches;

    figures.forEach(function (figure) {
      var video = figure.querySelector('video');
      var button = figure.querySelector('[data-ambient-toggle]');
      var label = button && button.querySelector('[data-ambient-label]');
      // Une seule version est chargée : verticale sur téléphone, paysage sinon.
      var source = (small && video.dataset.srcSmall) || video.dataset.srcLarge || video.dataset.srcSmall;
      if (!video || !button || !source) return;

      var loaded = false;
      var failed = false;
      var userPaused = false;
      var inView = false;

      video.muted = true;
      video.setAttribute('muted', '');
      video.playsInline = true;

      function setLabel() {
        var playing = !video.paused && !video.ended;
        figure.classList.toggle('is-playing', playing);
        label.textContent = playing ? 'Mettre en pause' : 'Lire la vidéo';
      }

      function fail() {
        if (failed) return;
        failed = true;
        figure.classList.remove('is-ready', 'is-playing');
        figure.classList.add('is-failed');
        button.hidden = true;
      }

      function load() {
        if (loaded) return;
        loaded = true;
        video.src = source;
        video.load();
      }

      function play() {
        if (failed) return;
        load();
        var attempt = video.play();
        if (attempt && attempt.catch) {
          attempt.catch(function () {
            setLabel();
          });
        }
      }

      video.addEventListener('loadeddata', function () {
        figure.classList.add('is-ready');
      });
      video.addEventListener('playing', setLabel);
      video.addEventListener('pause', setLabel);
      video.addEventListener('error', fail);

      button.hidden = false;
      setLabel();
      button.addEventListener('click', function () {
        if (video.paused) {
          userPaused = false;
          play();
        } else {
          userPaused = true;
          video.pause();
        }
      });

      if ('IntersectionObserver' in window) {
        new IntersectionObserver(
          function (entries) {
            inView = entries[0].isIntersecting;
            if (inView && motionAllowed() && !saveData && !userPaused) play();
            else if (!inView && !video.paused) video.pause();
          },
          { rootMargin: '150px 0px', threshold: 0.25 }
        ).observe(figure);
      }

      onChange(reducedMotion, function () {
        if (!motionAllowed() && !video.paused) video.pause();
      });
    });
  })();
})();
