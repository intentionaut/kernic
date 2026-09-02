# kernic's voice

How kernic writes, anywhere a person reads it: the changelog, the README, CLI
output, error messages, docs, the Studio interface.

This is kernic's own voice. It is deliberately not the voice of anything else
published by the same people, and rules borrowed from elsewhere do not
automatically apply here. Where this file and another house guide disagree, this
file wins inside this repo.

## Who is reading

Someone who codes, often with an AI assistant, and wants their app to stop
looking like a default template. They are comfortable in a terminal. They may
not know or care about design theory, and nothing should require that they do.

They are not a designer being sold a methodology. They are a builder who wants
the thing to look right and to get back to work.

## The basics

| | |
|---|---|
| **Spelling** | American. color, customize, organize, behavior, gray. |
| **The name** | Lowercase `kernic` almost always, including at the start of a bullet. Capital "Kernic" only where a sentence genuinely demands it and lowercase would read as a typo. |
| **Person** | Second person for the reader, "you". "We" for the maintainers, sparingly, and only where a human actually did something. Never "we" meaning the software. |
| **Em dashes** | Fine in the README and in docs. The changelog does without them; keep it that way. |
| **Headings** | Sentence case. |
| **Numbers** | Numerals for anything a reader might count or compare: 33 looks, 8 theme families, 2k fonts. |
| **Commands** | In backticks, exactly as typed, with the flags a reader would actually use. |

## How it sounds

**Concrete over abstract.** Name the thing. "33 curated looks" beats "a range of
options". "It writes the files, then tells you the one line to add" beats "it
integrates with your project".

**Short sentences, and let them vary.** A run of identical lengths reads like a
machine wrote it.

**Explain the design word, once, in the clause.** A look, a token, a ramp, a
theme family: each of these can be defined in half a sentence where it first
appears, and then used freely. "A look is a finished decision: colors, fonts,
corners and text sizes, all chosen to go together." That is the pattern.

**Say what it does, not what it is.** Fewer nouns, more verbs.

**Confidence without hype.** kernic is good and does not need to say so. The
work is in showing what it does.

## Never

- **Marketing vocabulary.** seamless, robust, powerful, effortless, elevate,
  unlock, supercharge, game-changer, cutting-edge, transformative, revolutionize,
  leverage as a verb, "beautiful by default", "just works".
- **"It's not just X, it's Y."** Also "not only X but also Y". State the thing.
- **Announcing the sentence before saying it.** "It's worth noting that", "Here's
  the thing", "Let me be clear", "The good news is". Say it.
- **Announcing evidence before showing it.** "Studies show", "the data is clear".
- **Exclamation marks**, outside quoted speech.
- **Emoji in headings.**
- **Rhetorical questions as a closer.**
- **Talking down another tool by name.** Describe the problem, not the
  competitor. "Stop your assistant inventing its own colors" is about the
  problem. Naming a product it happens to do that in is not.
- **Adverbs doing a verb's job.** "quietly writes", "simply exports",
  "effortlessly applies". Cut the adverb or replace it with what happened.
- **Design authority the reader did not ask for.** kernic makes good defaults
  available. It does not lecture anyone about kerning, contrast ratios or why
  their old palette was wrong.

## Error messages and CLI output

Same voice, tighter. Three parts, in this order:

1. What happened, in plain words.
2. Why, if kernic knows. If it does not know, say that instead of guessing.
3. The exact next command, or the exact thing to change.

Never blame the user. "No design system found here" is the shape;
"You forgot to run `kernic init`" is not. And never claim a thing worked before
reading back that it did.

## The changelog

Its own rules are at the top of `CHANGELOG.md` and they are hard rules. This
file governs the voice those entries are written in.

## When something new comes up

If a word or a pattern gets caught twice in review, add it here. A voice guide
that is not edited stops describing how anything actually gets written.
