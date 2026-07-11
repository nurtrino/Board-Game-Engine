import type { Intro } from '../ttr/GameIntro';

export const FEAST_INTRO: Intro = {
  title: 'A Feast for Odin',
  tagline: 'CLASSIC BASE · 2016 · BUILD A VIKING ESTATE',
  goal: 'Create the most valuable estate by sending Vikings to work, upgrading goods, fitting them onto your boards, sailing, exploring, building, breeding animals, and feeding the feast. Cover negative spaces while opening income and recurring bonuses.',
  points: [
    { label: 'PLACE VIKINGS', detail: 'Choose one open action space. Its column costs 1, 2, 3, or 4 Vikings. Resolve every printed effect, then explicitly end your turn.' },
    { label: 'UPGRADE AND PLACE GOODS', detail: 'Orange becomes red, red becomes green, and green becomes blue without changing shape. Green and blue goods cover negative spaces on your home and exploration boards.' },
    { label: 'OPEN INCOME AND BONUSES', detail: 'Advance the income diagonal in order. Enclose a printed bonus without covering its symbol to collect that item every round.' },
    { label: 'SAIL AND EXPLORE', detail: 'Whaling boats, knarrs, and longships unlock different actions. Explore new puzzle boards or emigrate a large ship to reduce every future feast and score heavily.' },
    { label: 'FEED THE FEAST', detail: 'Cover the open Banquet Table with orange food, red food, and silver. Every gap becomes a Thing Penalty worth minus 3 points.' },
    { label: 'SCORE THE ESTATE', detail: 'Ships, emigration, boards, buildings, animals, occupations, silver, and final income score. Uncovered minus-one spaces and Thing Penalties subtract.' },
  ],
  rulebook: '/feast/rulebook.pdf',
};

