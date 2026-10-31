# SIDtune manual

SIDtune plays Commodore 64 music in your browser. It emulates the C64 and its SID sound chip cycle by cycle, so tunes sound the way they
did on the real machine. Everything runs on your own device: your library, playlists, favorites and settings are stored in this browser
and nothing is uploaded.

## 1. Getting music

There are two ways to fill your library, and you can use both at once.

**The online HVSC catalogue.** When the site offers it, the whole High Voltage SID Collection (HVSC, more than 60,000 tunes) appears in
your library straight away. Only the list is downloaded up front; each tune is fetched the first time you play it and kept for next time.
It refreshes itself when a new HVSC release comes out. You can switch it off under *Settings → Online HVSC*.

To have every tune available offline, use *Settings → Online HVSC → Download the whole collection*. It shows how much is left to fetch
(several hundred MB for the full HVSC), keeps playing while it downloads, and can be stopped and resumed later; tunes already stored are
skipped. *Clear library* removes the stored tunes again.

**Your own files.** Use *Add folder* or *Add files / zip* at the bottom of the sidebar, or drop files anywhere on the page:

- an unpacked HVSC folder (pick the `C64Music` folder),
- loose `.sid` files,
- a `.zip` containing either.

Tunes you import are copied into the browser, so they stay available offline. If an imported tune has the same path as one in the online
catalogue, your copy wins.

### Song lengths and STIL notes

SID tunes usually loop forever, so SIDtune needs to know how long each one is. HVSC's `DOCUMENTS/Songlengths.md5` provides that, and
`DOCUMENTS/STIL.txt` adds background notes (composer comments, cover versions, trivia) shown in the Now Playing panel. Both are picked up
automatically when you import an HVSC folder, and the online catalogue includes them. You can also load them under *Settings → Collection
data*. Tunes without a known length play for the default length set in Settings (3 minutes unless you change it).

### C64 ROMs

A small number of tunes (RSID tunes and some that rely on BASIC) need the C64's own KERNAL, BASIC and CHARGEN ROMs. These are copyrighted,
so SIDtune cannot include them. If you own copies, add them under *Settings → C64 ROMs* and reload the page.

## 2. Finding and playing tunes

- **Library** lists everything. Click a column heading to sort by title, composer or release; otherwise tunes are listed by path.
- **Search** (the box at the top, or press `/`) matches title, composer, year and path as you type.
- **Click a tune** to play it. Next, previous and shuffle then follow the list you started from. Change the search or the sort and
  they follow the new results; clear the search and they cover the whole list again. Looking at another list (Favorites, say) leaves
  what plays next alone until you start a tune there, or until the list you started from runs out: then *Next* carries on with the list
  on screen.
- **Shuffle** and **Repeat** sit next to the play button (or press `S` and `R`). Repeat cycles through off, all, and one.
- **Seek** with the slider under the transport, or `Shift+←` and `Shift+→` for 10 seconds at a time. Seeking is instant once the background render
  has caught up (see *Instant seeking* below).

### Subtunes

Many SID files contain several tunes (a title tune, in-game music, jingles). The Now Playing panel lists them as numbered chips; press
`1` to `9` to jump straight to one. The tune starts on the subtune its author marked as the default.

### Favorites, playlists and history

- The heart marks a favorite. Favorites have their own view in the sidebar.
- Create a playlist with the `+` next to *Playlists*. Add tunes with the `+` on a row, or from the Now Playing panel. Double-click a
  playlist to rename it.
- **History** keeps the last 500 tunes you played.

## 3. Now Playing

On a wide window the Now Playing panel is open from the start; on smaller screens click the tune in the player bar (or press `N`) to open it. It shows:

- the title, composer, release and chip details (6581 or 8580, PAL or NTSC, number of SID chips);
- a **visualiser**: a scrolling piano roll of every voice on every SID chip, coloured by waveform, plus an oscilloscope and the filter
  settings. The button in its top-right corner (or `V`) shows it full screen; `Esc` or the button again brings it back. On iPhone,
  where Safari can't make part of a page full screen, it fills the browser window instead;
- **Voice 1, 2, 3** buttons that mute individual voices, handy for picking apart how a tune is built;
- the subtunes, the STIL notes, and the Download and Share buttons.

## 4. Sound

### Audio quality modes

The button next to the volume (or `Ctrl+E`) picks how the chip output is presented:

| Mode | What it does |
|---|---|
| Real | Through a tiny monitor speaker, as most people heard it in the eighties |
| Pure | The raw chip, nothing added |
| Magic | Mild stereo widening, light delay and reverb. The recommended default |
| Epic | The same chain turned up: wide, deep delay and reverb, bold bass |
| Mythic | Everything cranked to 11 |

The same panel has a 3-band equalizer (low, mid, high).

### Emulation settings

Under *Settings → Sound*:

- **Emulation engine**: reSIDfp is the accurate reference; SIDLite is much lighter and is the default on phones and tablets.
- **SID chip**: *Auto* uses the chip the tune was written for. You can force the original 6581 or the later 8580; they sound noticeably
  different, especially the filter.
- **Machine clock**: PAL or NTSC. This changes tempo and pitch; *Auto* follows the tune.
- **Digi boost** makes sample playback audible on the 8580.
- **Instant seeking** renders the whole tune into memory in the background so the seek slider responds immediately. Once that render
  has caught up, playback comes from memory and the emulator rests, so it costs little extra CPU. It needs about 11 MB of memory per
  minute of music. Turn it off to save memory; seeks then take a few seconds. With it on, muting a voice can take a moment to be heard,
  because the tune is rendered again from the start with the new mix; playback carries on with the old mix meanwhile.
- **Pre-render long tunes** (on by default, needs Instant seeking) renders tunes longer than 10 minutes (5 on phones and tablets) in
  full as well, so they seek instantly too. A 30-minute tune takes about 330 MB of memory. Turn it off and those tunes keep only the part
  you have already heard; seeking beyond that takes a few seconds.
- **Show pre-render progress** (on by default) draws a thin line under the seek bar showing how much of the tune is ready for instant
  seeking. It fades once the whole tune is rendered, and starts again from the left after you mute a voice.

## 5. Downloading

The *Download…* menu in the Now Playing panel saves the current tune:

| Format | What you get |
|---|---|
| Original SID file | The tune file exactly as SIDtune loaded it |
| FLAC | Lossless audio, about a fifth of the size of WAV |
| WAV | Uncompressed 16-bit audio |
| MP3 | 256 kbps, plays everywhere |

Audio downloads render the current subtune at 44.1 kHz for its known length (or the default length), in the background while you keep
listening. FLAC and MP3 files are tagged with the title, composer and year. Downloads are the raw chip sound: muted voices, the audio
quality mode and the equalizer are not applied.

## 6. Sharing

*Share* in the Now Playing panel (or `L`) copies a link to the current tune, including the subtune if it isn't the default. On a phone it
opens the system share sheet instead. Whoever opens the link sees the tune and a Play button.

Links work for any tune in the online HVSC catalogue. A tune that exists only in your own imported files can only be played by someone who
has imported it too.

## 7. Appearance

Choose a theme under *Settings → Appearance*, or press `T` to cycle through them (`Shift+T` goes backwards):

- **SIDtune Purple**, the default;
- **C64 Blue**, the colours of the C64's start-up screen;
- **Green Phosphor** and **Amber Phosphor**, like the monochrome monitors of the time;
- **Monochrome Dark** and **Monochrome Light**.

The same section picks the **font**: your system's own (the default), the Apple II's 40-column lettering (Print Char 21), the
C64's (Pet Me 64), or JetBrains Mono, a clear modern monospaced font. The two retro fonts are by Kreative Korp. They look best with the
matching theme: try C64 Blue with the C64 font, or Green Phosphor with the Apple II one. It also switches tooltips on or off, and decides whether the About window greets you when SIDtune starts.

## 8. Keyboard shortcuts

Shortcuts work whenever you are not typing in a text field.

| Key | Action |
|---|---|
| `Space` | Play or pause |
| `←` / `→` | Previous or next tune |
| `Shift+←` / `Shift+→` | Seek back or forward 10 seconds |
| `1` – `9` | Play subtune 1 to 9 |
| `+` / `-` | Volume up or down |
| `S` | Shuffle on or off |
| `R` | Repeat: off, all, one |
| `F` | Favorite the playing tune |
| `N` | Open or close Now Playing |
| `V` | Visualiser full screen on or off |
| `L` | Share a link to the playing tune |
| `/` | Search |
| `T` / `Shift+T` | Next or previous theme |
| `?` | This manual |
| `Ctrl+E` | Audio quality and equalizer |
| `Ctrl+,` | Settings |
| `Esc` | Close the open panel or window |

The play/pause, next and previous keys on your keyboard or headset work too, as do the lock screen and Control Center on phones and
the media controls in your browser.

## 9. Your data

- Everything SIDtune stores (imported tunes, playlists, favorites, history, settings) lives in this browser on this device. Updates to
  SIDtune keep it, but clearing the site's data in your browser removes it, and another browser, device or web address starts empty.
- Once you have favorites, playlists or imported tunes, SIDtune asks the browser to keep its data even when disk space runs low (Firefox
  asks you first). Settings shows whether the browser agreed.
- *Settings → Backup → Save backup* saves your favorites, playlists, history and settings as a small file. *Restore a backup* loads such a
  file and replaces what's there. Use it to move to another browser or device, or as insurance. Imported tunes are not part of the backup;
  import the folder again.
- *Settings → Library → Clear library* removes imported tunes, tunes stored from the online catalogue, song lengths and STIL notes but keeps
  favorites and playlists.
- Nothing is uploaded. The only network traffic is fetching the online catalogue and the tunes you play from it.

## 10. Troubleshooting

- **No sound on iPhone or iPad**: make sure the volume is up. SIDtune plays even with the silent switch on.
- **Stuttering on a phone**: choose SIDLite under *Settings → Sound → Emulation engine*, and turn off Instant seeking.
- **The page reloads or crashes during a very long tune**: the browser ran out of memory. Turn off *Pre-render long tunes*.
- **A tune plays silence or garbage**: it may need the C64 ROMs (see *C64 ROMs* above).
- **A tune stops too early or runs on**: its length is missing or wrong in the song-length database; the default length is used instead.

## About the music

The tunes belong to their composers. HVSC is a volunteer archive and its terms limit use to private enjoyment. SIDtune is free software
(GPL-3.0), inspired by ultraSID but an independent project. The emulation is libsidplayfp (reSIDfp and SIDLite).
