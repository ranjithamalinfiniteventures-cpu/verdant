const STORY_KEY = 'verdant.story.v1';

const PANELS = [
  {
    scene: 'tower',
    eyebrow: 'BEFORE THE FALL',
    lines: ['LIFE WAS PEACEFUL', 'INSIDE VERDANT TOWER.'],
    sub: 'Until the scientists created Heartroot.',
  },
  {
    scene: 'heartroot',
    eyebrow: 'PROJECT HEARTROOT',
    lines: ['IT WAS DESIGNED', 'TO CREATE LIFE.'],
    sub: "But it didn't just grow. It learned.",
  },
  {
    scene: 'breach',
    eyebrow: 'CONTAINMENT LOST',
    lines: ['HEARTROOT ESCAPED.', 'THE TOWER FELL.'],
    sub: 'Its workers became something inhuman. You are the last survivor.',
  },
  {
    scene: 'ascent',
    eyebrow: 'YOUR ONLY WAY OUT',
    lines: ['CLEAR EACH FLOOR.', 'REACH THE ROOFTOP.'],
    sub: 'Escape before Heartroot claims you.',
  },
];

export class Story {
  constructor(onComplete){
    this.root = document.getElementById('story');
    this.eyebrow = document.getElementById('story-eyebrow');
    this.title = document.getElementById('story-title');
    this.sub = document.getElementById('story-sub');
    this.step = document.getElementById('story-step');
    this.nextButton = document.getElementById('story-next');
    this.skipButton = document.getElementById('story-skip');
    this.onComplete = onComplete;
    this.active = false;
    this.firstRun = false;
    this.index = 0;

    this.nextButton.addEventListener('click', e => { e.stopPropagation(); this.next(); });
    this.skipButton.addEventListener('click', e => { e.stopPropagation(); this.finish(); });
    this.root.addEventListener('click', () => this.next());
    addEventListener('keydown', e => {
      if (!this.active || e.repeat) return;
      if (['Enter', 'Space', 'ArrowRight'].includes(e.code)){ e.preventDefault(); this.next(); }
      if (e.code === 'Escape'){ e.preventDefault(); this.finish(); }
    });

    let seen = false;
    try { seen = localStorage.getItem(STORY_KEY) === 'seen'; } catch {}
    if (!seen) this.start(true);
  }

  start(firstRun = false){
    this.firstRun = firstRun;
    this.active = true;
    this.index = 0;
    this.root.hidden = false;
    this.root.classList.remove('leaving');
    this.show();
  }

  show(){
    const panel = PANELS[this.index];
    this.root.dataset.scene = panel.scene;
    this.eyebrow.textContent = panel.eyebrow;
    this.title.innerHTML = panel.lines.map(line => `<span>${line}</span>`).join('');
    this.sub.textContent = panel.sub;
    this.step.textContent = `${String(this.index + 1).padStart(2, '0')} / 04`;
    this.nextButton.textContent = this.index === PANELS.length - 1
      ? 'TAP ANYWHERE TO BEGIN'
      : 'TAP ANYWHERE TO CONTINUE';
    const card = this.root.querySelector('.story-copy');
    card.getAnimations().forEach(animation => animation.cancel());
    card.animate(
      [{ opacity: 0, transform: 'translateY(15px)' }, { opacity: 1, transform: 'translateY(0)' }],
      { duration: 420, easing: 'cubic-bezier(.2,.75,.25,1)' }
    );
  }

  next(){
    if (!this.active) return;
    if (this.index < PANELS.length - 1){ this.index++; this.show(); }
    else this.finish();
  }

  finish(){
    if (!this.active) return;
    const wasFirstRun = this.firstRun;
    this.active = false;
    try { localStorage.setItem(STORY_KEY, 'seen'); } catch {}
    this.root.classList.add('leaving');
    setTimeout(() => {
      this.root.hidden = true;
      this.root.classList.remove('leaving');
      this.onComplete?.({ firstRun: wasFirstRun });
    }, 420);
  }
}
