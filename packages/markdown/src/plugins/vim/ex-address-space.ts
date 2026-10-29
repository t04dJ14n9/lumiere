import { CodeMirror } from "@replit/codemirror-vim";

type StringStream = InstanceType<typeof CodeMirror.StringStream>;

/**
 * Real Vim eats spaces after `:` before the line address (`: 123` → line 123).
 * `@replit/codemirror-vim-core` `ExCommandDispatcher.parseInput_` calls
 * `eatWhile(':')` then parses the range without `eatSpace()`, so input ` 123`
 * fails the digit match, consumes the space in `parseLineSpec_`, and treats
 * `123` as an unknown command name (`Not an editor command ": 123"`).
 * Obsidian 1.14.4's bundled vim.js has the same gap; we fix it for note editing.
 *
 * vim-core's only `eatWhile(':')` call site is `parseInput_`. After that call,
 * eat leading spaces so `: 123`, `:123`, and bare `123` all move to line N.
 */
export function installExAddressLeadingSpaceFix(): () => void {
  const proto = CodeMirror.StringStream.prototype;
  const original = proto.eatWhile;
  proto.eatWhile = function (
    match: string | RegExp | ((ch: string) => boolean),
  ) {
    const stream = this as StringStream;
    const matched = original.call(stream, match);
    if (match === ":") {
      stream.eatSpace();
    }
    return matched;
  };
  return () => {
    proto.eatWhile = original;
  };
}
