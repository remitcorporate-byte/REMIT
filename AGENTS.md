# Rules for Codex

These rules override default instincts. Work is graded on whether a tired human
can open a file at 11pm and understand it in 30 seconds, not on cleverness or
token efficiency.

If something feels clever, compact, or optimized without an explicit request,
stop and write the boring version instead.

## 1. Never minify or hand-compress any file

This includes CSS, JavaScript, TypeScript, JSON, React, and JSX.

- Never pack multiple rules or statements onto one line to save space.
- Never remove whitespace or line breaks just to make a diff smaller.
- Give every CSS declaration its own line.
- CSS files may exceed 150 lines when the rules belong to one clear UI area.
  Split a stylesheet when it mixes unrelated concerns, not just to satisfy a
  line count.
- Break JSX elements with more than about two attributes across lines.
- Treat lines longer than about 100 characters as a signal to reformat.
- Files must be readable without horizontal scrolling or squinting.

## 2. One file, one job

A component file renders one piece of UI. Split a component when it handles
more than about two of these responsibilities:

- Authentication or session state
- List rendering
- Detail rendering
- Form handling
- Data fetching

React component files have a hard ceiling of 150 lines. This limit does not
apply to CSS files. Extract a child component before crossing it. Hooks, types,
and API calls belong in dedicated files such as `useFeature.ts`, `types.ts`,
and `api.ts`.

## 3. No premature abstraction

- Do not build generic, config-driven, factory, or plugin systems for one use.
- Write one-off behavior plainly where it is used.
- Abstract only after the same pattern appears at least three times.
- Match the existing repository structure unless a change is requested.

## 4. No defensive boilerplate nobody asked for

- Add cleanup flags, cancellation, and mounted guards only for a plausible race.
- Do not wrap every function in `try/catch` when the caller handles errors.
- Prefer clear named interfaces and types over inference gymnastics such as
  `Awaited<ReturnType<typeof functionName>>`.

## 5. Use human naming and structure

- Choose descriptive class, variable, and function names.
- Extract repeated conditional class logic after it appears more than once.
- Avoid one-letter names except trivial loop counters.

## 6. Prefer the junior-friendly version

Choose obvious, boring code that is easy to modify six months later. Do not
optimize for showing off or reducing the diff by a few lines.

## 7. Ask instead of guessing at scope

Small requests get small diffs. Do not refactor, reorganize, or improve nearby
code unless the request includes that work.

## Self-check before finishing

- Is every component file under 150 lines?
- Is every file readable and uncompressed?
- Did I avoid abstractions that are used fewer than three times?
- Is every defensive guard protecting a real scenario?
- Can someone unfamiliar with the change understand it in one pass?

If any answer is no or uncertain, fix it before returning the work.
