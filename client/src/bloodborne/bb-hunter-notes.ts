// Two-line playstyle reads for the hunter select screen, written from each
// weapon's actual slot kit and abilities in shared/src/bloodborne/data.

export const BB_HUNTER_NOTES: Record<string, [string, string]> = {
  'saw-cleaver': [
    'Fast, safe cuts that stagger and then hit for a bonus point.',
    'Transformed kills draw a card and heal, so finish enemies on that side.',
  ],
  'threaded-cane': [
    'Dodging lashes every enemy within 1 space, so dive into packs.',
    'Transformed stagger stops enemy attacks of equal speed.',
  ],
  'hunter-axe': [
    'Rally Strike heals you for every point it deals. Sustain fighter.',
    'Transformed kills chain 2 free damage into a nearby enemy.',
  ],
  'ludwig-s-holy-blade': [
    'Combo Slash grants a free transform, setting up the 4 damage slam.',
    'Sword form chips an enemy in your space each time a slot clears.',
  ],
  'ludwig-s-uncanny-holy-blade': [
    'Clear slots often. Every clear deals 1 damage in your space.',
    'Combo Strike gives a free transform, so cycle forms constantly.',
  ],
  tonitrus: [
    'Transform each round to charge the next attack with speed and damage.',
    'Steady medium bludgeons. Save Heavy Slam for a charged turn.',
  ],
  reiterpallasch: [
    'Dodge at the enemy attack speed to counter for 2 damage.',
    'Transformed, feed a facedown card to Quicksilver Shot for free hits.',
  ],
  'burial-blade': [
    'Pull every enemy within 2 spaces onto you, then cleave the pile.',
    'Transformed slashes splash 1 damage to everything within 1 space.',
  ],
  'rifle-spear': [
    'Move before you strike. Each Move this round adds +1 damage.',
    'Transformed thrusts punish enemies that step into your space.',
  ],
  'stake-driver': [
    'Primed Slash transforms for free, arming the payoff turn.',
    'Detonate hits for 4 and hurls the survivors 2 spaces away.',
  ],
  'beast-claw': [
    'Strongest below 3 HP, gaining speed and damage. Ride the edge.',
    'Transformed kills heal 2 and move you 2, keeping the frenzy alive.',
  ],
  chikage: [
    'Spend your own blood for extra speed or damage on any attack.',
    'Transformed, every dodge heals 1 and cuts an enemy in your space.',
  ],
  kirkhammer: [
    'Sword form pokes safely and chips enemies as slots clear.',
    'Hammer form slams for 4 and cannot be staggered, but cannot dodge.',
  ],
  'logarius-wheel': [
    'Every attack heals 1, so grind through long brawls.',
    'Empowered side trades up to 2 HP for the same bonus damage.',
  ],
  'blade-of-mercy': [
    'Stagger works on enemy attacks of equal speed. Control the exchange.',
    'Transformed, fill slots fast so Combo Finisher lands a huge hit.',
  ],
};
