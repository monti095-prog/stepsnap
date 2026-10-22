# StepSnap: free step-by-step guide maker (Chrome, Edge, Brave)

Record your clicks and typing while you work through a task. StepSnap turns them into a step-by-step guide with annotated screenshots and downloads it as a PDF. It is a free, open-source alternative to tools like Scribe.

- **No sign-in, no account, no server.** Everything stays on your computer.
- **Automatic screenshots** with a red box around what you clicked.
- **Editable guide:** rename steps, reorder, delete, then download the PDF.
- **Works on any website**, including menus, chat boxes, and iframes.

**Website:** https://YOUR-USERNAME.github.io/stepsnap/

## Install (about 1 minute)

1. [Download the latest zip](https://github.com/YOUR-USERNAME/stepsnap/releases/latest/download/stepsnap-extension.zip) and extract it. Keep the extracted folder; Chrome loads the extension from it.
2. Open `chrome://extensions` (in Edge: `edge://extensions`).
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and choose the extracted folder (the one containing `manifest.json`).
5. Click the puzzle-piece icon and pin **StepSnap**.

## Use

1. Click the StepSnap icon, then **Start recording**.
2. Do your task. A small "Step captured" note confirms each step.
3. Click the icon again and press **Stop and create guide**.
4. Edit the steps if you like. The PDF downloads automatically, or use **Download PDF**.

## Privacy

StepSnap never sends data anywhere. Steps and screenshots are stored in your browser until you discard them. Password fields are never recorded. See the [privacy policy](https://YOUR-USERNAME.github.io/stepsnap/privacy.html).

## Known limits

- Screenshots may be slightly late when you click very fast (Chrome limits capture speed).
- Browser pages like `chrome://` and the Chrome Web Store cannot be recorded.
- Because it is installed from a folder, Chrome may show a "developer mode extensions" notice at startup.

## Contributing

Issues and pull requests are welcome. The source is in the [`extension`](extension) folder and has no build step.

## License

MIT
