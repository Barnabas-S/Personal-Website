if ('IntersectionObserver' in window) {
    document.documentElement.classList.add('js');

    const revealObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (entry.isIntersecting) {
                entry.target.classList.add('revealed');
            }
        });
    }, { threshold: 0.15 });

    document.querySelectorAll('.reveal').forEach((el) => revealObserver.observe(el));
}

const hero = document.getElementById('hero');
const canFollowCursor = window.matchMedia('(pointer: fine)').matches
    && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

if (hero && canFollowCursor) {
    let frame = null;

    hero.addEventListener('mousemove', (event) => {
        if (frame) return;

        frame = requestAnimationFrame(() => {
            const rect = hero.getBoundingClientRect();
            const x = ((event.clientX - rect.left) / rect.width) * 100;
            const y = ((event.clientY - rect.top) / rect.height) * 100;

            hero.style.setProperty('--mx', `${x}%`);
            hero.style.setProperty('--my', `${y}%`);
            frame = null;
        });
    });
}
