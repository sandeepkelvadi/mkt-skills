// ANSI color helpers — zero dependencies.

const enabled = process.stdout.isTTY && !process.env.NO_COLOR;

const wrap = (code, reset) => enabled
  ? s => `\x1b[${code}m${s}\x1b[${reset}m`
  : s => s;

export const bold   = wrap('1', '22');
export const dim    = wrap('2', '22');
export const green  = wrap('32', '39');
export const red    = wrap('31', '39');
export const yellow = wrap('33', '39');
export const cyan   = wrap('36', '39');
