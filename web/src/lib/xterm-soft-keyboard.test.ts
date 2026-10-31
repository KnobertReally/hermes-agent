// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { Terminal } from "@xterm/xterm";
import {
  attachImeCompositionGuard,
  isTouchLikeClient,
} from "@/lib/pty-soft-keyboard";

function mountTerm(screenReaderMode: boolean) {
  if (!window.matchMedia) {
    // jsdom ships no matchMedia; xterm's CoreBrowserService needs one.
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: () => ({
        matches: false,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
      }),
    });
  }
  const host = document.createElement("div");
  host.style.width = "600px";
  host.style.height = "300px";
  document.body.appendChild(host);
  const term = new Terminal({ allowProposedApi: true, screenReaderMode });
  term.open(host);
  const seen: string[] = [];
  term.onData((d) => seen.push(d));
  return { host, term, seen };
}

// Mimics what an Android/iOS on-screen keyboard delivers: no usable keydown
// (keyCode 229), text arrives as an `input` event with inputType insertText.
function softKeyboardType(textarea: HTMLTextAreaElement, text: string) {
  textarea.dispatchEvent(
    new KeyboardEvent("keydown", { keyCode: 229, key: "Unidentified", bubbles: true } as never),
  );
  textarea.value += text;
  textarea.dispatchEvent(
    new InputEvent("input", { inputType: "insertText", data: text, bubbles: true, composed: false }),
  );
}

describe("xterm soft-keyboard input path", () => {
  it("drops on-screen-keyboard text when screenReaderMode is on", () => {
    const { term, seen } = mountTerm(true);
    softKeyboardType(term.textarea as HTMLTextAreaElement, "hi");
    expect(seen).toEqual([]);
  });

  it("forwards on-screen-keyboard text when screenReaderMode is off", () => {
    const { term, seen } = mountTerm(false);
    softKeyboardType(term.textarea as HTMLTextAreaElement, "hi");
    expect(seen).toEqual(["hi"]);
  });

  it("keeps the IME guard from hiding keydown from xterm's textarea", () => {
    const { host, term } = mountTerm(false);
    const textarea = term.textarea as HTMLTextAreaElement;
    let reachedTextarea = 0;
    let reachedReactRoot = 0;
    textarea.addEventListener("keydown", () => reachedTextarea++, true);
    document.addEventListener("keydown", () => reachedReactRoot++);

    // The regression: a capture-phase guard on an ANCESTOR stops the event
    // before it ever reaches the textarea xterm listens on.
    const naiveGuard = (e: KeyboardEvent) => {
      if (e.keyCode === 229) e.stopPropagation();
    };
    host.addEventListener("keydown", naiveGuard, true);
    textarea.dispatchEvent(
      new KeyboardEvent("keydown", { keyCode: 229, bubbles: true } as never),
    );
    expect(reachedTextarea).toBe(0);
    host.removeEventListener("keydown", naiveGuard, true);

    // The shipped guard: xterm still sees the key, React's root does not.
    const release = attachImeCompositionGuard(textarea);
    textarea.dispatchEvent(
      new KeyboardEvent("keydown", { keyCode: 229, bubbles: true } as never),
    );
    expect(reachedTextarea).toBe(1);
    expect(reachedReactRoot).toBe(0);
    release();
  });

  it("treats a coarse pointer as a soft-keyboard client", () => {
    mountTerm(false); // installs the jsdom matchMedia stub
    expect(isTouchLikeClient()).toBe(false);
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: (query: string) => ({
        matches: query.includes("any-pointer: coarse"),
        addEventListener() {},
        removeEventListener() {},
      }),
    });
    expect(isTouchLikeClient()).toBe(true);
  });
});
