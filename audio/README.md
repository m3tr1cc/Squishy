# Audio sources

## iPod mini click-wheel sound

- Source: synthesized locally with the Web Audio API; no recorded asset is
  bundled.
- Model: a short 1,846 Hz piezo-like pulse based on published click-wheel
  reverse-engineering notes, with a 0.4 ms drive and 4 ms decay.
- License: original application code.
- Changes: generated only after user interaction and rate-limited to one click
  per registered menu increment.

## `thock-keypress.mp3`

- Source: “Keyboard, computer, mechanical, typing, individual keys, press,
  button, click, tap, One Keypress_96Khz_Mono_ZoomH4n_NT5-003.wav”
- Creator: MattRuthSound
- Source URL: https://freesound.org/people/MattRuthSound/sounds/561661/
- License: Creative Commons Attribution 4.0
- Changes: Freesound’s high-quality MP3 preview is bundled locally; playback is
  shortened, gain-shaped, low-shelf emphasized, and pitch-varied in the app.

## `slime-squish-1.mp3`, `slime-squish-2.mp3`, and `slime-squish-4.mp3`

- Sources: “Slime Squish 1”, “Slime Squish 2”, and “Slime Squish 4”
- Creator: floraphonic
- Source URLs:
  - https://pixabay.com/sound-effects/film-special-effects-slime-squish-1-218565/
  - https://pixabay.com/sound-effects/film-special-effects-slime-squish-2-218566/
  - https://pixabay.com/sound-effects/film-special-effects-slime-squish-4-218568/
- License: Pixabay Content License
- Changes: the original MP3 recordings are bundled locally; playback is
  gain-shaped, compressed, shuffled without immediate repetition, and given
  slight deterministic pitch variation in the app.
