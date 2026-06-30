# Numberl

This is a static Vite/React frontend for the existing Number Guessing RL game.
It lets a human player choose from the same structured question vocabulary in
`environment/question_space.py` and guess a secret number from 1 to 1000.

## Run locally

```bash
cd frontend
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Deploy on Vercel

Import the repo on Vercel and set the project root directory to `frontend`.
Vercel can use the included `vercel.json` settings:

- Build command: `npm run build`
- Output directory: `dist`
- Framework: Vite

## Game notes

- The frontend keeps the original seven-question game from `play_game.py`.
- A question can only be used once.
- At most two questions of the same type can be used in one round.
- Modular questions stop at modulo 5. There is no modulo 10 or modulo 1000.
- The app includes Daily and Practice modes.
- At the end of a round, the player can copy a JSON run log for future analysis.

## Candidate grid behavior

The grid visualizes the current candidate scale as a square. It ends at the
next biggest square number after the current maximum candidate, so if the
remaining candidate maximum is 125 the board becomes 12 by 12 and ends at 144.
Each in-range number is its own cell: filled cells are still possible
candidates, and blank cells have been eliminated. Number labels are shown only
when the cells are large enough to fit them cleanly. On desktop the grid sits
beside the question flow; on mobile it stacks above the question rows.

- Range: a yes answer zooms to the kept interval; a no answer removes that interval.
- Proximity: keeps the side closer to the answer, or only the tie point if equidistant.
- Parity: leaves alternating candidate cells.
- Modular: leaves repeating remainder cells for modulo 2, 3, 4, or 5.
- Digit Sum: keeps numbers above or below the selected digit-sum threshold.
- Special: keeps or removes sparse property matches such as prime, square, or Fibonacci.
- Digit Compare: keeps numbers that match the selected digit-position comparison.
- Divisible: keeps or removes regular multiple cells.

Continuous candidate sets render as filled cells across their region on the
current square board. Scattered candidate sets render as filled and blank cells, so
modulo/parity/divisibility questions do not look like one continuous range.

This intentionally avoids freeform question parsing. The UI presents the fixed
question set as strategy cards, which keeps the game faithful to the RL action
space and easy to host as a static site.
