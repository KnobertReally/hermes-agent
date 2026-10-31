/**
 * Soft-keyboard (tablet / phone / kiosk panel) input support for the chat PTY.
 *
 * On-screen keyboards do not report usable key codes: they emit `keydown`
 * with `keyCode` 229 and deliver the typed text as an `input` event whose
 * `inputType` is "insertText". Both of those paths need care before xterm.js
 * sees them, so they live here rather than inline in ChatPage.
 */

/**
 * True when the client types with an on-screen keyboard rather than a
 * physical one.
 *
 * xterm.js only handles the `input`-event path in `Terminal._inputEvent`,
 * which returns early while `screenReaderMode` is on. Enabling that option
 * unconditionally therefore makes the soft keyboard open and then silently
 * discard every keystroke, so the AT textarea is reserved for
 * pointer-precise clients.
 */
export function isTouchLikeClient(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia?.("(any-pointer: coarse)").matches === true) return true;
  return typeof navigator !== "undefined" && navigator.maxTouchPoints > 0;
}

/**
 * Keep keyCode-229 keydowns away from React's root event delegation (#52111).
 *
 * React 18 turns such a keydown into a synthetic `compositionstart`, and that
 * synthetic path sets composing state which fights xterm.js's own IME
 * handling — dropping the first keystroke of each composition chunk (most
 * visible with Cyrillic on Firefox, but any composing locale is affected).
 *
 * The listener must sit on xterm's own textarea in the BUBBLE phase. A
 * capture-phase guard on an ancestor (e.g. the terminal host) stops the event
 * before it reaches the textarea, where xterm registers its keydown and
 * CompositionHelper listeners — which breaks every on-screen keyboard. At the
 * target, xterm handles the event first and it still never bubbles to the
 * React root, which is all #52111 needed.
 *
 * @returns a cleanup function that removes the listener.
 */
export function attachImeCompositionGuard(target: HTMLElement): () => void {
  const guard = (event: KeyboardEvent) => {
    if (event.keyCode === 229 || event.key === "Process") {
      event.stopPropagation();
    }
  };
  target.addEventListener("keydown", guard);
  return () => target.removeEventListener("keydown", guard);
}
