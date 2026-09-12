/* Eclipse Foundry's reactor lanes. Pure logic, shared by the floor's warning
   shader and combat: the marked strip is exactly the strip that discharges. */
export const FLUX_HALF_WIDTH = 1.15;
export const FLUX_CHARGE = 1.8;
export const FLUX_BURST = 0.65;

export function inFluxLane(lane, pos, radius = 0){
  return Math.abs(pos[lane.axis] - lane.offset) <= FLUX_HALF_WIDTH + radius;
}

export class FluxLanes {
  constructor(){
    this.lanes = [
      { axis: 'x', offset: -7 }, { axis: 'z', offset: 7 },
      { axis: 'x', offset: 7 }, { axis: 'z', offset: -7 },
    ];
    this.reset();
  }

  reset(){
    this.cooldown = 5;
    this.next = 0;
    for (const lane of this.lanes){
      lane.phase = 'idle'; lane.t = 0; lane.playerHit = false;
      lane.hits = new Set();
    }
  }

  update(dt, enabled, wave){
    const events = { charge: [], fire: [] };
    if (!enabled){
      // A breather, death or restart must never leave a live strip behind.
      this.reset();
      return events;
    }
    for (const lane of this.lanes){
      if (lane.phase === 'idle') continue;
      lane.t += dt;
      if (lane.phase === 'charge' && lane.t >= FLUX_CHARGE){
        lane.phase = 'burst'; lane.t = 0;
        events.fire.push(lane);
      } else if (lane.phase === 'burst' && lane.t >= FLUX_BURST){
        lane.phase = 'idle'; lane.t = 0;
      }
    }
    this.cooldown -= dt;
    if (this.cooldown <= 0 && this.lanes.every(lane => lane.phase === 'idle')){
      const count = wave >= 12 ? 2 : 1;
      for (let i = 0; i < count; i++){
        const lane = this.lanes[(this.next + i) % this.lanes.length];
        lane.phase = 'charge'; lane.t = 0; lane.playerHit = false; lane.hits.clear();
        events.charge.push(lane);
      }
      this.next = (this.next + count) % this.lanes.length;
      this.cooldown = Math.max(4.4, 8.6 - wave * 0.12);
    }
    return events;
  }
}
