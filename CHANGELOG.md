# SIDtune version history

What changed for listeners, newest first. Versions before 0.5.0 were numbered afterwards from the project history.

## 0.8.0 — 2026-10-29

The arrow keys now change tunes: `→` plays the next tune and `←` the previous one. Seeking moved to `Shift+→` and `Shift+←` (10 seconds
at a time). The `<` and `>` keys are gone, since they didn't reliably reach SIDtune on every keyboard layout.

The Now Playing panel is open from the start on a wide window, so you see what's playing without pressing `N`. On smaller screens, where
the panel would cover the tune list, it stays closed until you open it.

## 0.7.1 — 2026-10-29

Shuffle and next now follow your search as you change it. Before, SIDtune remembered the search results from the moment you started a tune:
search for "mean", start a tune, then clear the search, and shuffle still only ever picked from the "mean" tunes. Now clearing or changing
the search (or the sort) changes what plays next straight away. A search that finds nothing keeps the previous selection, and browsing
another list such as Favorites leaves what plays next alone until you start a tune there.

## 0.7.0 — 2026-10-28

Two retro fonts join the font choice in *Settings → Appearance*: the Apple II's 40-column lettering (Print Char 21) and the C64's own
(Pet Me 64), both by Kreative Korp. Pair the C64 font with the C64 Blue theme, or the Apple II font with Green Phosphor, for the full
effect. They are built in and only download when you pick them.

## 0.6.0 — 2026-10-28

Choose the font: *Settings → Appearance → Font* switches between your system's own font and JetBrains Mono, a monospaced font that suits
the phosphor and C64 themes. It is built in, so it works offline, and like the theme it is remembered and applied from the first moment
the page appears.

## 0.5.3 — 2026-10-28

The `<` and `>` keys now skip tunes on every keyboard layout. On many European layouts these characters are typed with AltGr (or Option
on a Mac or iPad), and SIDtune ignored any key pressed together with those, so the shortcuts silently did nothing there. New: `S` turns
shuffle on and off and `R` cycles repeat through off, all and one.

## 0.5.2 — 2026-10-28

On iPad the seek bar sat right at the bottom edge of the screen, where swiping for the home screen and app switcher starts, so reaching for
it could set off the system instead. It now sits clear of that edge on touch screens, and the player bar leaves room for the home
indicator on every device. The previous and next buttons are bigger and easier to hit, and the `<` and `>` keys skip to the previous and
next tune.

## 0.5.1 — 2026-10-28

The system’s media controls now reach SIDtune: the play/pause, next and previous keys on your keyboard or headset, the lock screen and
Control Center on iPhone and iPad, Android's media notification, and the media hub in Chrome and Edge. They were wired up before, but
browsers only hand those controls to pages that play through an audio element, and SIDtune plays through Web Audio, so they never
arrived. A silent audio track now plays alongside the music to claim them. The lock screen also shows how far into the tune you are, and
if another app takes over the audio, SIDtune pauses instead of playing on underneath it.

## 0.5.0 — 2026-10-28

Six themes: the original purple, **C64 Blue** in the colours of the C64's start-up screen, **Green** and **Amber Phosphor** like the
monochrome monitors of the day (with a faint glow), and **Monochrome** dark and light. Pick one under *Settings → Appearance* or press `T`
to cycle through them. The visualiser and the tune covers follow the theme.

SIDtune now has a manual (*Help* in the sidebar, or `?`), this version history (click the version number next to the logo), and an About
window that greets you on startup until you untick it.

Share a tune: *Share* in Now Playing (or `L`) copies a link that opens straight to that tune and subtune for anyone with the online
catalogue. On phones it opens the share sheet.

More keyboard shortcuts: `1`–`9` jump to a subtune, `+`/`-` change the volume, `F` favorites the playing tune, `N` opens Now Playing and
`Ctrl+,` opens Settings. The full list is in the manual.

Tooltips can be switched off. Renaming or deleting a playlist and clearing the library now ask in SIDtune's own style instead of the
browser's plain pop-ups.

## 0.4.0 — 2026-10-28

The Export WAV button became a *Download…* menu: save the original SID file, or render the tune to FLAC (lossless, about a fifth of the
size of WAV), WAV or MP3 (256 kbps). FLAC and MP3 files carry title, composer and year tags. Rendering happens in the background, so the
music keeps playing and a progress message shows how far it has got.

## 0.3.1 — 2026-10-26

iPhone fixes: sound now plays with the silent switch on and starts reliably from the first tap, and a second tune no longer fails with
"evaluating 'e.engine'". The phone layout gives titles more room: row numbers are gone, the time column is narrower and the timestamps
larger.

## 0.3.0 — 2026-10-25

Audio quality modes modelled on ultraSID: Real (a small monitor speaker, as most people heard it at the time), Pure, Magic (the new
default), Epic and Mythic, plus a 3-band equalizer. They live behind the button next to the volume, or `Ctrl+E`. Next and previous use
chevrons now.

## 0.2.0 — 2026-10-25

Instant seeking: a background thread renders the whole tune into memory, so dragging the seek slider responds immediately instead of
taking seconds. It can be turned off in Settings to save memory and battery.

Also: the list scrolls to the playing tune, shuffle and repeat show clearly when they are on, the seek slider no longer jumps back while
you drag it, and starting a tune after a pause no longer stalls.

## 0.1.0 — 2026-10-25

First release. A browser-based SID player with cycle-accurate C64 emulation (reSIDfp or SIDLite), an online HVSC catalogue that streams
tunes as you play them, import of HVSC folders, `.sid` files and zips, search, playlists, favorites, history, shuffle and repeat, song
lengths and STIL notes, subtunes, per-voice muting, a live visualiser, WAV export, media-key support and a layout that works on phones.
