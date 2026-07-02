(() => {
    'use strict';

    const demo = document.getElementById('aurora-demo');
    if (!demo) return;

    const DAY_START = 8;
    const DAY_HOURS = 10;
    const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

    const PROPOSALS = {
        dentist: {
            title: 'Dentist appointment',
            source: 'SmileWorks Dental',
            day: 3, start: 7, dur: 1
        },
        offsite: {
            title: 'Team offsite planning',
            source: 'Priya Nair (invite.ics)',
            day: 1, start: 2, dur: 1.5
        },
        newsletter: null
    };

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const body = demo.querySelector('.ad-body');
    const status = demo.querySelector('.ad-status');
    const initialBody = body.innerHTML;
    const timers = new Set();

    function announce(text) {
        status.textContent = text;
    }

    function fmtTime(h) {
        const whole = Math.floor(h);
        const mins = Math.round((h - whole) * 60);
        return whole + ':' + String(mins).padStart(2, '0');
    }

    function fmtRange(s, d) {
        return fmtTime(DAY_START + s) + ' - ' + fmtTime(DAY_START + s + d);
    }

    function getNum(el, prop) {
        return parseFloat(el.style.getPropertyValue(prop));
    }

    function dayIndexOf(eventEl) {
        return Number(eventEl.closest('.ad-col').dataset.day);
    }

    function refreshEvent(el) {
        const s = getNum(el, '--s');
        const d = getNum(el, '--d');
        const title = el.querySelector('.ad-ev-title').textContent;
        el.querySelector('.ad-ev-time').textContent = fmtRange(s, d);
        el.classList.toggle('ad-event--short', d < 0.75);
        el.setAttribute('aria-label',
            title + ', ' + DAYS[dayIndexOf(el)] + ' ' + fmtRange(s, d) +
            '. Drag or use arrow keys to move.');
    }

    function moveEvent(el, day, s) {
        const d = getNum(el, '--d');
        const clamped = Math.max(0, Math.min(DAY_HOURS - d, Math.round(s * 2) / 2));
        const col = body.querySelector('.ad-col[data-day="' + day + '"]');
        if (!col) return;
        if (el.parentElement !== col) col.appendChild(el);
        el.style.setProperty('--s', String(clamped));
        refreshEvent(el);
    }

    function createEvent(prop) {
        const el = document.createElement('div');
        el.className = 'ad-event ad-event--email';
        el.tabIndex = 0;
        el.style.setProperty('--s', String(prop.start));
        el.style.setProperty('--d', String(prop.dur));
        const title = document.createElement('span');
        title.className = 'ad-ev-title';
        title.textContent = prop.title;
        const time = document.createElement('span');
        time.className = 'ad-ev-time';
        el.append(title, time);
        body.querySelector('.ad-col[data-day="' + prop.day + '"]').appendChild(el);
        refreshEvent(el);
        if (!reduceMotion) el.classList.add('is-new');
        return el;
    }

    function setEmailState(emailBtn, text) {
        let state = emailBtn.querySelector('.ad-state');
        if (!text) {
            if (state) state.remove();
            return;
        }
        if (!state) {
            state = document.createElement('span');
            state.className = 'ad-state';
            emailBtn.appendChild(state);
        }
        state.textContent = text;
    }

    function queueEl() {
        return body.querySelector('.ad-queue');
    }

    function updateQueueEmpty() {
        const empty = queueEl().querySelector('.ad-queue-empty');
        const hasCards = Boolean(queueEl().querySelector('.ad-proposal'));
        empty.hidden = hasCards;
    }

    function addProposalCard(id, prop) {
        const card = document.createElement('div');
        card.className = 'ad-proposal';
        card.dataset.email = id;

        const title = document.createElement('span');
        title.className = 'ad-prop-title';
        title.textContent = prop.title;

        const time = document.createElement('span');
        time.className = 'ad-prop-time';
        time.textContent = DAYS[prop.day] + ' ' + fmtRange(prop.start, prop.dur);

        const src = document.createElement('span');
        src.className = 'ad-prop-src';
        src.textContent = 'From: ' + prop.source;

        const actions = document.createElement('div');
        actions.className = 'ad-prop-actions';
        const approve = document.createElement('button');
        approve.type = 'button';
        approve.className = 'ad-approve';
        approve.textContent = 'Approve';
        const dismiss = document.createElement('button');
        dismiss.type = 'button';
        dismiss.className = 'ad-dismiss';
        dismiss.textContent = 'Dismiss';
        actions.append(approve, dismiss);

        card.append(title, time, src, actions);
        queueEl().appendChild(card);
        updateQueueEmpty();
    }

    function scanEmail(emailBtn) {
        const id = emailBtn.dataset.email;
        if (emailBtn.classList.contains('is-scanning') ||
            emailBtn.classList.contains('is-done') ||
            queueEl().querySelector('.ad-proposal[data-email="' + id + '"]')) {
            return;
        }
        emailBtn.classList.add('is-scanning');
        setEmailState(emailBtn, 'Scanning with local LLM…');
        announce('Scanning email on-device. Nothing leaves this page.');
        const timer = setTimeout(() => {
            timers.delete(timer);
            emailBtn.classList.remove('is-scanning');
            const prop = PROPOSALS[id];
            if (!prop) {
                emailBtn.classList.add('is-done');
                setEmailState(emailBtn, 'No event found - nothing added');
                announce('The model found no event in that email, so nothing was added.');
                return;
            }
            emailBtn.classList.add('is-done');
            setEmailState(emailBtn, 'Proposed - waiting for your review');
            addProposalCard(id, prop);
            announce('Proposed "' + prop.title + '" for ' + DAYS[prop.day] +
                ' ' + fmtRange(prop.start, prop.dur) + '. Approve it in the review queue.');
        }, reduceMotion ? 250 : 1000);
        timers.add(timer);
    }

    function emailFor(id) {
        return body.querySelector('.ad-email[data-email="' + id + '"]');
    }

    // ---- Click handling (delegated so Reset can restore markup freely) ----

    demo.addEventListener('click', (ev) => {
        const email = ev.target.closest('.ad-email');
        if (email) {
            scanEmail(email);
            return;
        }

        const approve = ev.target.closest('.ad-approve');
        if (approve) {
            const card = approve.closest('.ad-proposal');
            const id = card.dataset.email;
            const prop = PROPOSALS[id];
            card.remove();
            updateQueueEmpty();
            setEmailState(emailFor(id), '✓ Added to calendar');
            const el = createEvent(prop);
            announce('"' + prop.title + '" added to ' + DAYS[prop.day] +
                ' ' + fmtRange(prop.start, prop.dur) + '. Try dragging it.');
            el.focus({ preventScroll: true });
            return;
        }

        const dismiss = ev.target.closest('.ad-dismiss');
        if (dismiss) {
            const card = dismiss.closest('.ad-proposal');
            const id = card.dataset.email;
            card.remove();
            updateQueueEmpty();
            const email2 = emailFor(id);
            email2.classList.remove('is-done');
            setEmailState(email2, 'Dismissed - click to scan again');
            announce('Proposal dismissed. Nothing was added to the calendar.');
            return;
        }

        if (ev.target.closest('.ad-reset')) {
            timers.forEach(clearTimeout);
            timers.clear();
            body.innerHTML = initialBody;
            body.querySelectorAll('.ad-event').forEach(refreshEvent);
            announce('Demo reset.');
        }
    });

    // ---- Drag to move ----

    let drag = null;

    demo.addEventListener('pointerdown', (ev) => {
        const el = ev.target.closest('.ad-event');
        if (!el || ev.button > 0) return;
        const rect = el.getBoundingClientRect();
        drag = { el, offsetY: ev.clientY - rect.top, moved: false };
        el.setPointerCapture(ev.pointerId);
        ev.preventDefault();
    });

    demo.addEventListener('pointermove', (ev) => {
        if (!drag) return;
        const cols = [...body.querySelectorAll('.ad-col')];
        let day = dayIndexOf(drag.el);
        cols.forEach((col) => {
            const r = col.getBoundingClientRect();
            if (ev.clientX >= r.left && ev.clientX < r.right) day = Number(col.dataset.day);
        });
        const colRect = body.querySelector('.ad-col[data-day="' + day + '"]').getBoundingClientRect();
        const hourH = colRect.height / DAY_HOURS;
        const s = (ev.clientY - colRect.top - drag.offsetY) / hourH;
        drag.el.classList.add('is-dragging');
        drag.moved = true;
        moveEvent(drag.el, day, s);
    });

    function endDrag() {
        if (!drag) return;
        drag.el.classList.remove('is-dragging');
        if (drag.moved) {
            const title = drag.el.querySelector('.ad-ev-title').textContent;
            announce('"' + title + '" moved to ' + DAYS[dayIndexOf(drag.el)] + ' ' +
                drag.el.querySelector('.ad-ev-time').textContent + '.');
        }
        drag = null;
    }

    demo.addEventListener('pointerup', endDrag);
    demo.addEventListener('pointercancel', endDrag);

    // ---- Keyboard moves ----

    demo.addEventListener('keydown', (ev) => {
        const el = ev.target.closest('.ad-event');
        if (!el) return;
        const s = getNum(el, '--s');
        const day = dayIndexOf(el);
        let handled = true;
        if (ev.key === 'ArrowUp') moveEvent(el, day, s - 0.5);
        else if (ev.key === 'ArrowDown') moveEvent(el, day, s + 0.5);
        else if (ev.key === 'ArrowLeft') moveEvent(el, Math.max(0, day - 1), s);
        else if (ev.key === 'ArrowRight') moveEvent(el, Math.min(DAYS.length - 1, day + 1), s);
        else handled = false;
        if (handled) ev.preventDefault();
    });

    // Fill in time labels and aria-labels for the seeded events
    body.querySelectorAll('.ad-event').forEach(refreshEvent);
})();
