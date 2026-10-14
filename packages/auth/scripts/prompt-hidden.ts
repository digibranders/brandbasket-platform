import { stderr, stdin } from "node:process";

const ENTER = new Set(["\r", "\n"]);
const CANCEL = new Set(["\x03", "\x04"]); // Ctrl-C (ETX) and Ctrl-D (EOT)
const BACKSPACE = new Set(["\x7f", "\b"]);

/** Reads one line from the terminal without echoing what is typed. */
export function promptHidden(question: string): Promise<string> {
  if (!stdin.isTTY) {
    return Promise.reject(new Error("This command needs an interactive terminal to read a password."));
  }

  return new Promise((resolve, reject) => {
    let value = "";

    const finish = (error: Error | null): void => {
      stdin.off("data", onData);
      stdin.setRawMode(false);
      stdin.pause();
      stderr.write("\n");
      if (error === null) resolve(value);
      else reject(error);
    };

    const onData = (chunk: string): void => {
      for (const character of chunk) {
        if (ENTER.has(character)) return finish(null);
        if (CANCEL.has(character)) return finish(new Error("Cancelled."));
        if (BACKSPACE.has(character)) {
          // Drop one whole code point, not one UTF-16 code unit, so backspacing over a surrogate pair
          // (an emoji, for example) removes the whole character instead of leaving it mangled.
          value = Array.from(value).slice(0, -1).join("");
          continue;
        }
        value += character;
      }
    };

    // Written to stderr, not stdout, so the prompt stays visible even when stdout is redirected
    // (e.g. piping the command's output to a file).
    stderr.write(question);
    stdin.setEncoding("utf8");
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on("data", onData);
  });
}
