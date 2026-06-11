// ---------- Error class ----------

export class NeedlescriptError extends Error {
  readonly slLine?: number;
  constructor(msg: string, line?: number) {
    super(line ? `${msg} (line ${line})` : msg);
    this.name = 'NeedlescriptError';
    this.slLine = line;
  }
}
